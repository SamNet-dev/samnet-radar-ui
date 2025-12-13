# SamNet Radar Data Feed (Public)

Endpoint:
https://www.samnet.dev/radar-data/aircraft.json

## Quick start (browser)
```js
fetch("https://www.samnet.dev/radar-data/aircraft.json")
  .then(r => r.json())
  .then(data => console.log(data));
