"""Timers on tiles: "off in 30 minutes" for lights, switches and fans, and "closes in 10 minutes"
for a motorized window after airing.

They run in Home Assistant, not in the browser, so they also fire when the tablet is off or the page closed.
They survive a restart (kept in .storage). Switching the device off by hand ends its timer.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Callable

import voluptuous as vol

from homeassistant.auth.permissions.const import POLICY_CONTROL
from homeassistant.components import websocket_api
from homeassistant.core import Context, Event, HomeAssistant, callback
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.helpers.event import async_track_point_in_utc_time, async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN

STORAGE_KEY = f"{DOMAIN}.timers"
SIGNAL = f"{DOMAIN}_timers_changed"
DATA = f"{DOMAIN}_timers"
# What a timer may switch off. A cover only counts when it is a motorized window (see _check):
# a garage door, a gate, a plain door or a shade never closes on a timer.
DOMAINS = ("light", "switch", "fan", "input_boolean", "cover")
MAX_MINUTES = 12 * 60
CLOSE_FEATURE = 2  # CoverEntityFeature.CLOSE
# States in which there is nothing left to do when the time is up.
DONE_STATES = {"off", "closed", "closing", "unavailable", "unknown"}


class Timers:
    """The running timers of the house: entity_id → when it goes off."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, 1, STORAGE_KEY)
        self.timers: dict[str, dict[str, Any]] = {}
        self._cancel: dict[str, Callable[[], None]] = {}
        self._unsub_state: Callable[[], None] | None = None

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        now = dt_util.utcnow()
        for entity_id, t in (data.get("timers") or {}).items():
            at = dt_util.parse_datetime(t.get("at", ""))
            if at is None:
                continue
            self.timers[entity_id] = {"at": at.isoformat(), "user": t.get("user")}
            # Due while Home Assistant was down: switch off right away.
            self._schedule(entity_id, max(at, now + timedelta(seconds=1)))
        self._watch()

    def as_dict(self) -> dict[str, str]:
        return {entity_id: t["at"] for entity_id, t in self.timers.items()}

    async def async_set(self, entity_id: str, minutes: int, user_id: str | None) -> str:
        at = dt_util.utcnow() + timedelta(minutes=minutes)
        self._unschedule(entity_id)
        self.timers[entity_id] = {"at": at.isoformat(), "user": user_id}
        self._schedule(entity_id, at)
        await self._changed()
        return at.isoformat()

    async def async_cancel(self, entity_id: str) -> None:
        if entity_id not in self.timers:
            return
        self._unschedule(entity_id)
        self.timers.pop(entity_id, None)
        await self._changed()

    def unload(self) -> None:
        for cancel in self._cancel.values():
            cancel()
        self._cancel.clear()
        if self._unsub_state:
            self._unsub_state()
            self._unsub_state = None

    # ---- inside ----
    def _schedule(self, entity_id: str, at: datetime) -> None:
        @callback
        def fire(_now: datetime) -> None:
            self.hass.async_create_task(self._fire(entity_id))

        self._cancel[entity_id] = async_track_point_in_utc_time(self.hass, fire, at)

    def _unschedule(self, entity_id: str) -> None:
        cancel = self._cancel.pop(entity_id, None)
        if cancel:
            cancel()

    async def _fire(self, entity_id: str) -> None:
        timer = self.timers.pop(entity_id, None)
        self._cancel.pop(entity_id, None)
        if timer is None:
            return
        st = self.hass.states.get(entity_id)
        if st is not None and st.state not in DONE_STATES:
            # A window closes, everything else switches off.
            domain, service = ("cover", "close_cover") if entity_id.startswith("cover.") else ("homeassistant", "turn_off")
            await self.hass.services.async_call(
                domain, service, {"entity_id": entity_id}, blocking=False,
                context=Context(user_id=timer.get("user")),
            )
        await self._changed()

    async def _changed(self) -> None:
        await self._store.async_save({"timers": self.timers})
        self._watch()
        async_dispatcher_send(self.hass, SIGNAL)

    @callback
    def _watch(self) -> None:
        """Switched off, or a window closed, by hand before the time: the timer is done."""
        if self._unsub_state:
            self._unsub_state()
            self._unsub_state = None
        if not self.timers:
            return

        @callback
        def changed(event: Event) -> None:
            new = event.data.get("new_state")
            entity_id = event.data.get("entity_id")
            if new is not None and new.state in ("off", "closed") and entity_id in self.timers:
                self.hass.async_create_task(self.async_cancel(entity_id))

        self._unsub_state = async_track_state_change_event(self.hass, list(self.timers), changed)


def _timers(hass: HomeAssistant) -> Timers | None:
    return hass.data.get(DATA)


def _check(hass: HomeAssistant, connection: websocket_api.ActiveConnection, entity_id: str) -> None:
    domain = entity_id.split(".")[0]
    if domain not in DOMAINS:
        raise vol.Invalid(f"{entity_id} can't have a timer")
    if domain == "cover":
        # Only a motorized window. Closing a garage door or a gate on a timer is nothing to set by accident.
        st = hass.states.get(entity_id)
        attrs = st.attributes if st is not None else {}
        if attrs.get("device_class") != "window":
            raise vol.Invalid(f"{entity_id} is not a window")
        if not int(attrs.get("supported_features") or 0) & CLOSE_FEATURE:
            raise vol.Invalid(f"{entity_id} can't be closed")
    if not connection.user.permissions.check_entity(entity_id, POLICY_CONTROL):
        raise Unauthorized(entity_id=entity_id, permission=POLICY_CONTROL)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "hauspanel/timer/set",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("minutes"): vol.All(int, vol.Range(min=1, max=MAX_MINUTES)),
    }
)
@websocket_api.async_response
async def ws_timer_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    timers = _timers(hass)
    if timers is None:
        connection.send_error(msg["id"], "not_loaded", "HausPanel is not set up")
        return
    try:
        _check(hass, connection, msg["entity_id"])
    except vol.Invalid as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    at = await timers.async_set(msg["entity_id"], msg["minutes"], connection.user.id)
    connection.send_result(msg["id"], {"at": at})


@websocket_api.websocket_command({vol.Required("type"): "hauspanel/timer/cancel", vol.Required("entity_id"): cv.entity_id})
@websocket_api.async_response
async def ws_timer_cancel(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    timers = _timers(hass)
    if timers is None:
        connection.send_error(msg["id"], "not_loaded", "HausPanel is not set up")
        return
    if not connection.user.permissions.check_entity(msg["entity_id"], POLICY_CONTROL):
        raise Unauthorized(entity_id=msg["entity_id"], permission=POLICY_CONTROL)
    await timers.async_cancel(msg["entity_id"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "hauspanel/timer/subscribe"})
@callback
def ws_timer_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The running timers now and after every change, for the panels to show."""

    @callback
    def send() -> None:
        timers = _timers(hass)
        connection.send_message(websocket_api.event_message(msg["id"], {"timers": timers.as_dict() if timers else {}}))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL, send)
    connection.send_result(msg["id"])
    send()


def register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_timer_set)
    websocket_api.async_register_command(hass, ws_timer_cancel)
    websocket_api.async_register_command(hass, ws_timer_subscribe)


async def async_start(hass: HomeAssistant) -> Timers:
    timers = Timers(hass)
    await timers.async_load()
    hass.data[DATA] = timers
    return timers


def stop(hass: HomeAssistant) -> None:
    timers = hass.data.pop(DATA, None)
    if timers:
        timers.unload()
