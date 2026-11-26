# Changelog

## 1.21.1

- **Sidebar panel** (*Settings → This screen → Sidebar panel*): the cameras show a red Live dot once the live picture runs, and the calendar can show a chosen number of events and how far ahead (today, 3, 7 or 14 days).

## 1.21.0

- **Rooms tab**: the view buttons no longer sit on top of the edit and settings buttons.
- **Rooms tab**: a fourth view, Fit to screen, sizes the rooms so all of them fit on the screen at once.
- **Scenes in the sidebar** (*Settings → This screen → Sidebar panel*): the scene buttons can be large, one per row with the whole name, instead of two small ones per row.
- **Cameras in the sidebar** (*Settings → This screen → Sidebar panel*): pick one or more cameras to show live, one below the other, in the left panel. A tap shows a camera full screen.
- **Energy page**: the chart and the biggest consumers fill the screen on tablets, and the cards above no longer cut their labels.

## 1.20.1

- **3D printers** with English entity names no longer show up a second time in their room as a washing machine.
- **Devices with a power meter only** also show under *On now* while they are on.

## 1.20.0

- **Ad blockers**: a panel file was named like a known tracking script, so ad blockers using EasyPrivacy (uBlock Origin, for example) could keep the panel from loading. It has a new name now.
- **Motorized windows** are no longer treated as shades: the shades chip, the room's shade buttons, floor buttons and the Good night check leave them alone. They keep their own tile in the room.
- **Machine sockets** (*printer popup → Socket*): the printer popup has a button for its socket, also while the printer is off. On a power strip only the machine's outlet is folded into its popup, the other outlets stay in the room, and the socket can be picked by hand.
- **Parcels popup**: no longer shows "nullnull" below the list when nothing was delivered in the last two days.
- **Update note**: a screen that still runs the old HausPanel after an update, like the Companion app kept in the background, now offers "Reload", and the bug report info shows the version that really runs.
- **Favourites** (*Home → Add favourite*): a room's folder in the picker lists its group helpers and the devices added to the room by hand, so a light group can be picked there too.
- **Tilt for blinds** (*long press a cover*): covers with adjustable slats, like Venetian blinds, get a slat slider in their popup, or buttons to open and close the slats when that is all they can do.
- **Timer** (*long press a light, switch or window*): besides the fixed times there is "Other time", in steps of 15 minutes up to 12 hours.
- **Home Connect appliances** (*appliance popup*): state and program come from the right sensors, a delayed start shows as starting later, remaining time, finish time and an open door show up, also with the renaudallard integration.
- **Stellantis cars** (Opel, Peugeot and others via stellantis-vehicles): the car popup finds them in any language, with charge level, range, charging end, mileage, service, doors and whether the car is locked, and shows the picture from the tracker when there is no other.
- **Socket power**: a power or energy sensor that the integration files under Diagnostic, like with Tuya Local, is used when the device has no other one.
- **Light chip**: counts the same lights as the room cards, also a light group that stands in for hidden lamps and lights without a room.
- **Hidden** (*Settings → Hiding*): a device type or integration you switch on no longer jumps to the top while the settings are open.
- **Room popup with several thermostats**: each one shows with its own name and icon, and the ring says which one it shows.
- **Own pages** (*Settings → Navigation*): pick an icon for each page.
- **Rooms tab**: follows the order of the rooms on Home until you sort it yourself.
- **Devices with a power meter only** (*edit mode → power sensor tile → Device*): a power sensor without a switch, like an oven on a metering relay, can show as a device that is on above a threshold, with how long it has been on and what it used today.

## 1.19.0

- **Russian** texts, following Home Assistant's language. Thanks to @k-rts.
- **Thermostat dial**: the coloured arc stays in its track when the dial is turned quickly.
- **EMS-ESP heat pumps**: "Running now" shows the compressor, the heating circuit pump and the hot water circulation, and the fan turns with the compressor speed.
- **Light groups**: a room that holds nothing but a group helper shows up with that group now, whether its lamps sit in another room, have no room at all, or are hidden in this one.
- **Window timer** (*long press a window*): motorized windows can close on their own after 10 minutes to an hour, like the light timers. Garage doors and gates never get one.
- **Home Assistant notifications** (*Settings → Home → Notices*): notifications from Home Assistant show up as a notice on Home, and a tap lists them to read and dismiss. Off until you switch it on.
- **Volkswagen cars** (volkswagen_connect): the car popup finds them without a device tracker, with charge level, fuel, range, charging, service, and doors, windows and locks from their own sensors. They fill the car ring in the wallbox popup too.

## 1.18.0

- **evcc charge mode and limit** (*wallbox popup*): evcc charge points get the charge mode row (off, now, pv and so on) and their charge limit with minus and plus, and "Full at" shows evcc's remaining time while charging.
- **Room temperature**: a temperature from a device that also measures power or energy, like a relay or an energy meter in the fuse box, is only used when the room has nothing better, and never when it has a thermostat.
- **Water costs**: with a water meter in litres, costs are no longer 1000 times too high. The price counts per m³ (or gallon), as in Home Assistant's energy settings.

## 1.17.0

- **Group light buttons** (floor, room, all lights off): lamps that didn't follow get a second try on their own, one at a time, and Home Assistant's own error messages no longer cover the "Try again" button.
- **Room popup → Customise**: lights can be marked as not counted and measuring sockets as meter only right there, not only in edit mode on the room page.
- **Several wallboxes**: wallbox tiles in a room show their device's name when there is more than one wallbox, like the buttons in the energy popup.
- **SolaX HAC charge mode** (*wallbox popup*): pick the charger's use mode (Stop, Fast, ECO, Green) right in the popup; the run mode still shows what the charger is doing.

## 1.16.0

- **More devices when leaving** (*Leaving home → More devices*): pick switches and media players, like a TV or a coffee machine. They show up in the window while they are on and are switched off with the rest.
- **HACS**: HausPanel is in the HACS default list now. Search for it in HACS, no custom repository needed.

## 1.15.0

- **Panel files** are served through Home Assistant's own static file handling, so loading a dashboard no longer checks files on Home Assistant's event loop, which could stall it on slow storage like an SD card.
- **Parcel links** only open for http and https addresses from the parcel sensors.
- **evcc wallboxes** (ha-evcc integration): the wallbox popup finds every evcc charge point, with its charging power, this charge, the total, whether a car is plugged in or charging, and the car's charge level and range from evcc. With several wallboxes, the energy popup has a button for each.
- **EMS-ESP hot water** (*heat pump popup*): the hot water button starts and stops a hot water charge through EMS-ESP's dhw charge switch, and defrosting and a compressor fault show up as such.
- **EMS-ESP heat pumps** (Buderus and others over MQTT): the heat pump popup finds them without a water heater entity and shows heating or hot water from the compressor activity.
- **SolaX HAC wallbox**: the wallbox popup finds a SolaX HAC from the solax-modbus integration, with its charging power, this charge, the total and whether a car is plugged in or charging.
- **Portuguese** texts, following Home Assistant's language (Português and Português (Brasil)).
- **Music search** (*player popup*): the search field finds songs, artists and albums as well as playlists in Music Assistant, and a tap plays it on that speaker.
- **Lights that don't count** (*edit mode → light tile*): mark a light like a word clock or an aquarium as not counted. It keeps its tile and switches as usual, but the room card, the dots, the room, floor and home buttons, Leaving home and the Good night check leave it alone.

## 1.14.1

- **Older iPads** show the panel again. On an iPad that Apple no longer updates (iPadOS 15, so an iPad Air 2, mini 4 or iPad 5), the panel stayed blank with "Unable to load custom panel" — since 1.6.4 one room rule used a regular expression that Safari reads only from 16.4. The rule is written differently now and works the same.
- **Leaving home**: tap a device in the window to leave it alone when you go, like a motion light outside. It moves to "Left alone" and can be brought back from there.

## 1.14.0

- **Several inverters** (*Settings → Rooms & devices → Energy*): every solar source from Home Assistant's energy settings counts now, in the live power, the energy and solar popups, and each gets its own power sensor.
- **Battery charge level** (*Settings → Rooms & devices → Energy*): the battery shows its charge level in the energy popup and on the energy page, and its power and charge sensors can be picked by hand.

## 1.13.0

- **Grouped notices** (*Settings → Home → Notices*): give notices the same group, like all pollen sensors, and they show as one notice that lists which of them are on.
- **NINA warnings** no longer show up as a detector alarm on Home and in the security popup. Add them under *Settings → Home → Notices* to see them as a notice.

## 1.12.0

- **Christmas** (*Settings → Home → Christmas*): a Christmas chip on Home from the first Sunday of Advent to 7 January. Its popup switches your Christmas lights (all on, outdoor only, all off), counts down to Christmas Eve and shows sunset and power. Lights are found by a "christmas" label, by their name or added by hand. It stays off until you turn it on; a welcome window offers it once.
- **Modes chip** (*Settings → Home → Status chips*): pick the switches and helpers you use as modes, like a guest or party mode. The chip shows which one is on, and a tap switches each of them.
- **Security badge**: doors, windows and locks hidden in the security popup no longer count on the badge, the security card, the security page or the SecurityPanel.

## 1.11.0

- **Baby monitor with sound**: a speaker button in the baby monitor and its full-screen view turns the camera's sound on and off, and each screen remembers the choice. Needs a camera that sends sound; it plays only while the baby monitor is open.
- **People in the header**: a person that is hidden in Home Assistant (*entity settings → Visible*) no longer shows up in the header.
- **Remote control** (*player popup → Remote*): one column on every screen, like a real remote, with the same buttons throughout and a touchpad instead of the arrow pad (swipe to move, tap for OK). The arrow pad can still be picked on each screen.
- **Weather warnings in notices** (*Settings → Home → Notices*): a DWD or NINA warning shows its headline, and a tap opens the full text with the time it applies.

## 1.10.0

- **French README** (README.fr.md). Thanks to @Marlboro62.
- **Security popup**: doors, windows, gates and locks show their room first and their name below, so two windows that are both called "Window" can be told apart. A name that already contains the room stays as it is.
- **Meter readings** on the energy page: a card that opens the current readings of the grid, gas and water meters from Home Assistant's energy settings.

## 1.9.0

- **Security badge** on Home, the security card, the security page and the SecurityPanel count the same things as the security popup. A lock that shows once together with its lock sensor, like a car's, no longer counts as open while it reports unknown or unavailable.
- **Light groups** (*room → Customise → Add devices*): group helpers can be added to a room by hand now. They still don't show up on their own, and the floor buttons, the Light chip and the room counts keep using the single lamps.

## 1.8.0

- **Detector alarms on Home** (*Settings → Home → Notices → Detectors*): a red notice on Home while a smoke, leak or gas detector raises the alarm, with its room and what it found.
- **Weak detector batteries**: a notice on Home when a detector's battery is at 20 % or less. Devices you put aside under *Maintenance* don't count. Both can be switched off together.
- **Battery in the energy popup**: the home battery is its own circle below the grid. The line runs into the battery while it charges and into the house while it gives.
- **Energy chip** (*Settings → Home → Status chips*): shows the grid as before, or the whole house with solar and battery.
- **Water** on the energy page: a card with litres, cost and the change to the day before, and a thin row of water bars below the chart. A tap opens today, this week and this month, and the flow right now when there is a flow sensor. Uses the water meter from Home Assistant's energy settings.
- **Night view** for wall tablets (*Settings → This screen → Night view*): at night the tablet turns into a security screen with the chosen cameras live and large, the rest small, locks, gates and open doors, and the alarm modes. Night by the sun or set times. A tap shows Home for 2 minutes. Pick whether it takes the screensaver's place at night or both come.
- **Leaving home** now lists thermostats that are heating. Tick them and they go to their away or eco mode, or off if they have neither. Off by default, and *Undo* puts them back too.
- **Remote** in the player popup: a player whose device has a remote in Home Assistant gets a second tab with the arrows, OK, back, home and menu, next to volume, source and playback. Held arrows repeat. Works with Apple TV, Android TV, Roku, Samsung, Sony Bravia, Philips and LG. Players without a remote look as before.

## 1.7.2

- **Leak and gas sensors** are no longer called smoke alarms. The group in the security popup is named after what it holds: smoke alarms, leak sensors, gas detectors, or detectors for a mix, with a matching icon and alarm text like *Water detected!*.
- **Home battery** on the energy page: charging no longer counts as use and discharging does, as in Home Assistant's own energy dashboard. The battery gets its own part in the chart, and what came out of it counts for self-sufficiency.
- **Energy popup**: the house total includes the battery, and a tile shows whether it charges or discharges right now.
- Energy settings in the older format (grid power under *power*, meter under *flow_from*) are read too. Before, the energy chip and today's grid use and cost were missing there.

## 1.7.1

- **Time to air** (*Settings → Home → Notices*): a notice on Home for each room with 1400 ppm CO₂ or more, or 70 % humidity or more. Not while a window in the room is open, and not for outdoor rooms or sensors.
- **Lock changes** (*Settings → System*): Edit and the settings for everyone, only for admins, or only with a PIN. With *Admins only* the buttons are gone for everyone else. After the PIN they stay open for 10 minutes. Meant against changes by accident on a family tablet, Home Assistant's own user rights still apply.
- **Timers in the room popup**: the Light and Switches tiles show when the next one goes off, and each lamp and switch in the list shows its time left.
- README: new screenshots, and after an update restart Home Assistant (a reload of the integration is not enough).

## 1.7.0

- **Screensaver** for wall tablets (*Settings → This screen → Screensaver*): after 2 to 30 minutes without a touch the screen shows the time, the date, the weather and what is left of today. It moves a little every minute and is darker at night. A tap brings HausPanel back, and so does the doorbell. Not on the phone or the security screen.
- **Timers** for lights, switches and fans: hold a tile and pick *Switch off in* 15 min, 30 min, 1 h or 2 h. The tile shows how long is left. Home Assistant runs the timer, so it also works with the tablet off and after a restart. Switching off by hand ends it.
- **Window open, heating on** (*Settings → Home → Notices*): a notice on Home for each room where a window is open while its heating runs. A tap opens the thermostat.
- **Floor, room and home buttons** switch the lights a few at a time instead of all in one go. Some integrations got too many commands at once and lamps were left behind. Lamps that didn't follow are now named, with *Try again*.
- **Info for a bug report** (*Settings → System*): versions, panel, layout and device in a few lines to copy into an issue. Nothing personal goes in.

## 1.6.7

- **Music card** on Home now looks like a room card: the room on top (or the source when the player has no room), title and artist in the middle, progress and round buttons for play/pause and next below. While something plays or is paused, its cover sits dimmed behind the card. When the card is low, like on the phone, the artist is left out.

## 1.6.6

- **Update notice**: after an update HausPanel tells you when Home Assistant still runs the old version and offers *Restart* (admins only, tap twice). A screen that still shows older code than Home Assistant offers *Reload*. Both can be closed with ×. This works from the next update after this one.

## 1.6.5

- **Long room names** (*Settings → Rooms*): when a name doesn't fit next to the buttons, cut it with … as before, set it smaller, or let it wrap onto a second line.

## 1.6.4

- **Room temperature with a decimal** (*Settings → Rooms*): shows 21.7° instead of 22° on the room tiles.
- Rooms whose name sounds like something else now find their thermometer: an attic called *Dachboden* was taken for a floor sensor, a *Wintergarten* for the garden outside.

## 1.6.3

- **Gas and battery** on the energy page: a gas card in the unit of your meter (m³ or kWh) with its costs, and a battery card with what it gave and what it took. Both come from *Settings → Dashboards → Energy*. Thanks to @ComPExperTR.
- **Turkish**, translated by machine like the other languages besides English and German. Thanks to @ComPExperTR.

## 1.6.2

- Parcels: the sensors are now found by what they are, not by their name, so the chip also works when the parcel sensors are named in another language or renamed. Pickup and outgoing lists are left out as before.

## 1.6.1

- **Parcels** are now a status chip at the top of Home, like Waste and Maintenance: it shows when the next parcel comes or how many are on the way, and only while one is coming or just came. A tap opens the list with the parcels on their way and the ones delivered in the last two days; a tap on a parcel opens its tracking page. Switch the chip off under *Settings → Home → Status chips* or with − in edit mode. The parcel list further down on Home is gone.

## 1.6.0

- **Notices** (*Settings → Home → Notices*): pick entities of your own, like a helper for *Mail is here* or a washing machine sensor, and they show on Home only when they matter. Switches and helpers show while on; sensors and lists at the states you enter (several separated by commas, or a number like `>0`). A helper is cleared with the tick on its pill.
- **Parcels**: with the [parcel integrations](https://ha-parcel-integrations.github.io/) (one per carrier, or their aggregator) Home shows the parcels on their way: sender, carrier, status and when it comes, the next one first. A tap opens the tracking page. Switch them off under *Settings → Home → Notices*.
- Rooms with only a door contact, a motion sensor or other sensors now show up as well, with those sensors on their page.
- Scenes: *Tap to confirm* no longer runs out of the pill on the phone and in the side panel; long scene names end in "…".

## 1.5.3

- **Settings** on a big screen: a bigger window with the tabs as a list on the left. Sections with a single switch are merged (Rooms: opening, presence, scenes and shades in one place; Look: classic popups under Style), long lists (speakers, energy devices, cameras, device types, integrations) show their first six and *Show all*. On the phone, two-way choices sit below their label.
- Rooms with nothing to switch but a thermometer or another reading (a cellar, a storeroom) now show up, with their temperature, and their page shows what they measure.
- Room popup: the room's temperature shows once, on top, not again under *More in this room*.

## 1.5.2

- Settings → Energy on the phone: the sensor pickers sit below their label in full width instead of running over it. Other pickers in the settings shrink instead of overflowing.

## 1.5.1

- **Settings → Rooms & devices → Energy**: pick which sensor shows the house's, the solar roof's and each device's power right now, or leave a device out. Use and costs still come from Home Assistant's energy settings.
- A meter with three phases or several channels now shows its total instead of phase A.
- **Cameras**: the second, smaller stream of a camera (Reolink *fluent*, UniFi *low*, *sub* …) and still pictures of the last event start switched off on the Security page. *Settings → Security → Cameras* switches them on.

## 1.5.0

- **Floor buttons** in the room list (phone and tablet): next to each floor's name, one button switches all its lights off (or on when all are off), two more move all its shades up or down. Each shows only when the floor has such devices.
- Buttons that need two taps (gates, the doorbell opener, scenes) now say *Tap to confirm* after the first tap.
- **Favourites**: the picker has *Cards* on top: *Now playing* (the music card, whatever plays right now), Security, Climate and Today can be added like rooms and devices.
- **Settings → Rooms & devices → Speakers & TVs**: one switch per player; off hides it everywhere in HausPanel. The Media page and its player buttons list the same players as the rooms, each once.
- Media players that can't be reached get no tile; they come back by themselves once they are online again. Players that are just off stay.
- **Music Assistant**: its players, which come without a room, join the room of their twin (the speaker's own player with the same name or device name) and stand for it there, so a room shows the player that is really playing. Players with no twin get no tile under Other but still show on Home's music card while they play.
- **Gate and garage popup**: after the second tap it says *Sent – waiting for the door to move*, and when the door hasn't moved after 20 seconds, or Home Assistant refuses the command, it says so. Doors that can't stop (many garage openers) keep Open and Close while moving instead of showing a Stop that does nothing.
- A pool's filter pump is no longer shown like a washing machine, and a machine seen by two integrations (Home Connect and WashData) shows once.
- Browser Mod's own entities (the browser's "screen" light, media player and tab camera) stay out of rooms and security.
- Presence ignores sensors of things that move themselves (a car's *moving*, a phone): a sensor whose device has a device tracker doesn't count.
- **Presence in rooms** (a personal choice, *Settings → Rooms & devices → Show presence in rooms*): a small person on room cards and in the room list while someone is there, and in the room popup how long it has been quiet. Presence and occupancy sensors count; a room's motion sensors only when it has none, so a second, slower sensor of the same device doesn't count twice.

## 1.4.2

- Security popup, the settings list and the Security page use the same icons as the pills: a gate contact set up as a door shows a gate there too.
- Cameras: the red dot on a camera pulses only while pictures really arrive; while connecting or when a stream stalls it is grey.

## 1.4.1

- **Panel layout, left side**: *On now* can show under the scenes (Settings → This screen → Side panel), small and two per row; the scenes there are two per row too.
- Security pills: a gate allowed to be open says *OK until 19:00* instead of a text that ran out of the pill; a gate contact set up as a door gets a gate icon; long second lines end in "…".
- Status chips keep one line, so on the phone the Waste chip is as tall as the others.

## 1.4.0

- **Waste chip**: with Waste Collection Schedule or a waste calendar (Abfall, Müll, Waste, Trash, Bin …), a chip shows on Home the day before and on the day of a pickup (*Tomorrow: Yellow bin*), coloured by kind of bin; a tap shows the next two weeks.
- **Motion in the room popup**, a personal choice in *Settings → Rooms & devices*: *Motion now* or how long the room has been quiet.
- **Back up and restore** in *Settings → System*: the panel's settings as a file, and loading them back after a confirmation.
- **Take settings from another panel** (same place): from MobilePanel, HausPanel or SecurityPanel, either the house settings (hidden devices, door time windows, Security page cameras, doorbell, baby monitor, calendars, weather …) or everything.
- **Lite mode** in *Settings → This screen → Effects*: no blur, glow or endless animations. *Automatic* turns it on when the screen seems slow.

## 1.3.1

- Last movements: a **full screen** button next to the close button. On the iPhone the clip itself goes full screen.
- Edit mode: the **status chips** on Home can be dragged with a finger (the page no longer scrolls away) and no longer flip back and forth between chips of different widths; tiles sort the same steady way.

## 1.3.0

- **Maintenance** also lists devices that went quiet (a temperature, humidity or battery sensor without news for two days) and consumables that are nearly used up (filters, brushes, mops, dust bags, toner, ink at 10 % or less). Each can be ignored like the others.
- **Worth a look** at the top of the settings: devices without a room, rooms without a floor, cameras that can't be reached, each linking its guide.
- The last movements in the security popup only show when Frigate is there.
- **Clips play on the iPhone**: the last movements load the short clip first and play it from memory, since Home Assistant passes Frigate clips on without the byte ranges iPhones need. A spinner shows while it loads; without a clip yet, the snapshot.
- GitHub: forms for bug reports, ideas and translations; the README explains how to fix a translation and shows a short demo.

## 1.2.0

**New for everyone**
- **Welcome**: the first time you open HausPanel, three short steps: your rooms (how many were found, how many devices have no room), the layout for this screen, and where the settings and guides are. *Settings → System* shows it again.
- **Step by step**: guides in English and German in `docs/`, and a link to the right one on every settings tab.
- **More languages**: French, Dutch, Spanish, Italian, Polish and Swedish, besides English and German. The font now has the extended Latin letters too.

**Rooms**
- **Rooms tab**: on tablet and desktop every room at once, by floor, as cards, rows or compact rows. A tap opens the room popup, holding opens the room page (with *All rooms* to go back).
- **Shades in the room popup**: one wide tile with a slider that sets all shades of the room at once; expanded, one slim line per shade with its own slider, up and down (Stop while moving).
- Settings: *A tap on a room opens* with two clear choices, room at a glance or full room page.

**Security**
- **Cameras** in *Settings → Security*: which ones the Security page shows, and which ones the last movements come from.
- **Last movements** per person: the camera button next to them picks the cameras just for you; Home Assistant keeps the choice with your user.
- **Leaving home** and **Good night** warn when windows are open and rain, a thunderstorm or frost is coming in the next hours.

**Other**
- Status text on room cards stays on one line in every language.
- German texts now say *Sicherheits-Popup* and *Babyphone* throughout.

## 1.1.0

**Settings**
- New **Security** tab: watched doors, gates and locks (order, shown or hidden), when each may be open, the parts of the security popup, good night check, doorbell and baby monitor in one place.
- Every settings tab starts with one line on what it is for.

**Security**
- **May be open**: a time window per door, gate or lock (with weekdays, overnight works) in which it being open is not a warning.
- The Security chip and the security page open a popup: what is open, the alarm with its modes, smoke detectors, the last movements from Frigate with short clips, and Leaving.
- The security popup fits on one screen; a pencil arranges its parts.

**Rooms**
- Room popup with temperature ring, big tiles for light, shades, music and switches; per room you choose which sections are open by default.
- Shades as a draggable window with up, 50 %, down and stop, also for all shades of a room at once.
- Room tiles on the phone all have the same height; long names get a little smaller.

**Popups**
- Weather on one screen: sky for the time of day, feels like, humidity, wind, sunrise or sunset, the next hours and 7 days with rain.
- New or reworked popups for the wallbox, solar, heat pump, car, appliances and the good night check.

**Other**
- Cameras are told apart indoors and outdoors by their room, not by their name.

## 1.0.0

First release.
