# SamNet Radar Data Feed (Public)

Endpoint:
https://www.samnet.dev/radar-data/aircraft.json

## Browser example
fetch("https://www.samnet.dev/radar-data/aircraft.json")
  .then(r => r.json())
  .then(data => console.log(data));

## curl example
curl -s "https://www.samnet.dev/radar-data/aircraft.json" | head -c 800; echo

## Notes
- Live feed from a local ADS-B receiver.
- Please be respectful with request rate.
- Data is provided as-is.
