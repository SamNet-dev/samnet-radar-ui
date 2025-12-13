# SamNet Radar UI

A lightweight, no-build, front-end UI for **SamNet Live Radar**.

This repository contains the **public UI** and documentation for a live ADS-B aircraft feed that I self-host at SamNet.

## Live links
- UI: https://www.samnet.dev/radar/
- Public JSON feed: https://www.samnet.dev/radar-data/aircraft.json

## What this project is
SamNet Radar is a self-hosted aircraft tracking setup built for learning and experimentation:

- A local receiver (RTL-SDR + ADS-B software) produces a live JSON snapshot of nearby aircraft.
- The receiver runs on a Raspberry Pi Zero on my LAN.
- My main server proxies that JSON to the public internet behind HTTPS.
- This UI fetches the JSON and renders aircraft state in the browser.

This repo is meant to be fork-friendly: you can use the UI as a base, or use the public JSON endpoint for your own experiments.

## Architecture (high level)
Receiver (Pi Zero) -> ADS-B stack -> JSON feed -> Nginx reverse proxy -> public endpoint -> browser UI

## Using the public feed
### JavaScript (browser)
```js
fetch("https://www.samnet.dev/radar-data/aircraft.json")
  .then(r => r.json())
  .then(data => console.log(data));
