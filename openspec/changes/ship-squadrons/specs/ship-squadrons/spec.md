## ADDED Requirements

### Requirement: Ships are squadrons by size
Each ship class SHALL have a size, and one ship of it SHALL stand for that many hulls:
- fighter 8;
- frigate 4;
- destroyer 3;
- cruiser 2;
- heavy cruiser 1;
- capital ship 1.

A ship's hull points and attack SHALL be those of its whole squadron.

#### Scenario: A frigate
- **WHEN** a fleet has one Lancer (a frigate)
- **THEN** it is a squadron of four hulls sharing the Lancer's hull and attack

### Requirement: Losses cut a squadron's firepower
A damaged squadron SHALL fire only with the hulls it has left: the share of its hulls its damage has not yet destroyed, rounded up. A single-hull ship SHALL fire fully until it is destroyed.

#### Scenario: Half a squadron lost
- **WHEN** a frigate squadron carries damage of more than half its hull points
- **THEN** it fires with half its attack or less

### Requirement: Area weapons against swarms, beams against capitals
Barrage and suppression damage SHALL do more against squadrons of many hulls than against single hulls (0.8× for one hull up to 1.5× for fighters). Long-range damage SHALL do more against single hulls than against swarms (1.3× for one hull down to 0.6× for fighters).

#### Scenario: Flak against fighters
- **WHEN** the same missile and flak fleet fights fighters and then a dreadnought
- **THEN** it deals more damage to the fighters than to the dreadnought

### Requirement: The battle view draws squadrons
The battle view SHALL draw each ship as its squadron's hulls in formation, and hulls SHALL be destroyed one by one as the squadron's health falls.

#### Scenario: A squadron losing hulls
- **WHEN** a frigate squadron's health falls from full to half during a round
- **THEN** two of its four hulls explode and two keep fighting
