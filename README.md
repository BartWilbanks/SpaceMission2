# Rhys' Space Mission

Multiplayer browser game using Node + Express + Socket.IO.

## Local run
1. Install Node 18+.
2. In this folder:
   - `npm install`
   - `npm start`
3. Open:
   - Player: http://localhost:3000/
   - Host:   http://localhost:3000/host.html

## Gameplay
- Each player starts near a different random planet.
- Collect planet items in a random order by flying close and pressing LAND.
- After all 9 planet items are collected, find the Big Dipper (it moves each restart) and LAND near a star to win.
- Shooting: Spacebar or tap/click canvas (host shows kills leaderboard).
- Sun hazard: cross the dashed ring and you die + mission restarts (shields decrement).
- Shields: 3 per run; every death consumes 1 shield (can reach 0).

## Deploy
Upload to GitHub, then connect to Render as a Web Service:
- Build: `npm install`
- Start: `npm start`
