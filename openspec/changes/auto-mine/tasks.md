## 1. Rules
- [x] 1.1 `FleetOrders.autoMine`; the `orders` codec carries it; `setOrders` keeps trade runs and stores the flags the same way in browser and server
- [x] 1.2 Pure search (`src/core/fleet/AutoMine.ts`): resources a group mines, stock left in fields that are not dry, nearest system with stock by ring scan (ties: more left, then star id)
- [x] 1.3 `followOrders`: a stationed auto-mining fleet with nothing to mine here moves to the nearest field with stock within 80 ly, with a dispatch; fleets in transit and fleets still surveying are left alone

## 2. UI
- [x] 2.1 "Auto-mine" chip on the fleet card and in the Fleets panel, only for fleets with mining ships

## 3. Tests
- [x] 3.1 Search: nearest, tie-break, reach, determinism
- [x] 3.2 Simulation: dry home field moves the fleet; stocked field keeps it; order off or no miners stays; others' depletion counts; in transit untouched; trade kept
- [x] 3.3 Server: the command agrees with the browser, older orders read as off, the server's year makes the same move
