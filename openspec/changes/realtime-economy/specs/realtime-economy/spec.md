# Spec Delta

## Purpose

Keeps a realtime economy bounded and gives the empire work that takes time.

## ADDED Requirements

### Requirement: Storage caps
Each stored resource (metals, gases, crystals, food and trade goods) SHALL have a storage cap, raised by each colony and by Warehouses. Yearly income SHALL stop at the cap; stock already above the cap SHALL be kept. Credits, influence and faith are not stored goods and SHALL have no cap.

#### Scenario: Full storage
- **WHEN** metals are at their cap and a year resolves with positive metal income
- **THEN** metals stay at the cap and the report says storage is full

#### Scenario: No cap on money
- **WHEN** an empire with a million credits resolves a year with positive credit income
- **THEN** its credits grow by that income, with no storage limit

### Requirement: Upkeep
Every ship in service SHALL cost credits each year by role; the Conscription policy SHALL waive upkeep for warships.

#### Scenario: Paying the fleet
- **WHEN** an empire has three civilian ships, two warships and one capital ship and no Conscription
- **THEN** it pays 3 + 4 + 8 credits that year

### Requirement: Construction queues
Ships and buildings SHALL be paid for when queued and SHALL complete after a number of years. Each shipyard SHALL build one ship at a time and each colony one building at a time, in queue order. Queued buildings SHALL count against the colony's slots.

#### Scenario: Two hulls at one yard
- **WHEN** two three-year hulls are queued at one yard in the same year
- **THEN** the first launches after three years and the second after six

### Requirement: Standing orders
A fleet with auto-explore SHALL survey unexplored planets where it is on station while its supply lasts. A fleet with return-to-resupply SHALL head home when it is outside friendly space and cannot afford to explore any remaining planet there.

#### Scenario: Survey while away
- **WHEN** a survey group with both orders arrives at an unexplored system and the player is offline
- **THEN** it surveys what its supply allows and then sets course for home
