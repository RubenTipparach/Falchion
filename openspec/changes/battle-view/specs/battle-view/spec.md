## ADDED Requirements

### Requirement: A round at sea is logged in enough detail to draw it
Each round at sea SHALL log, per side, the ships lost and the ships boarded by class, the damage dealt by doctrine, the jamming and flak factors, each class's hull points and the damage each class group carries at the end of the round. Its results SHALL stay those of the rules, and the log SHALL hold no ammunition.

#### Scenario: Losses add up
- **WHEN** a round is resolved
- **THEN** the losses and boardings by class add up to the round's totals and to what each fleet has left

#### Scenario: Same round, same log
- **WHEN** the same round is resolved twice with the same fleets and seed
- **THEN** the log, breakdown included, is the same

### Requirement: A fleet keeps its battle's last round
A fleet in a battle at sea SHALL keep the last round as a small record with that fleet first: both fleets going into the round with the damage they carried, the round's breakdown, and each fleet's strength when the battle began, carried over from round to round.

#### Scenario: Both empires keep the round
- **WHEN** two players' fleets fight a round
- **THEN** each empire's save holds the round with its own fleet first, and the two records mirror each other

#### Scenario: The meter's starting point carries over
- **WHEN** the battle goes on to its next round
- **THEN** the new record keeps the starting strength of the first round

### Requirement: Anyone who sees a battle can watch it
A fleet's public view SHALL carry its battle's round, the foe's names and the round record, bounded by the server; clients SHALL check another player's record before using it and drop what does not fit.

#### Scenario: Watching another player's battle
- **WHEN** a player selects another player's fleet that is in a battle at sea
- **THEN** the fleet card shows the battle and a Watch battle button that opens the battle view

#### Scenario: A malformed record
- **WHEN** a public view holds a record with bad class ids, counts or factors
- **THEN** the server and the client keep only the valid parts, or drop the record

### Requirement: Battles are marked on the map
Every battle at sea you can see SHALL be marked on the map with a pulsing red hex where it is fought and a crossed-swords marker with its round number; clicking the marker SHALL open the battle view.

#### Scenario: A battle near your fleets
- **WHEN** one of your fleets, or a fleet you can see, fought a round this year or last
- **THEN** its hex pulses red with a marker showing the round, and clicking it opens the view

### Requirement: The battle view replays the latest round
The battle view SHALL cover the map with both fleets in formation drawn with the game's ship meshes, the range closing by band, and every shot and loss of the latest round played across the world year it was fought in; the next round SHALL replace it when the server's state brings it.

#### Scenario: Watching a round
- **WHEN** the view is open during the year a round was fought
- **THEN** the ships fire their doctrines' weapons, and the ships the round destroyed or boarded die or change colours during that minute

#### Scenario: The next round arrives
- **WHEN** the next year's round is fought
- **THEN** the view switches to it, with the fleets as they went into it

### Requirement: Every loss has a visible cause
The view's schedule SHALL be a pure, seeded function of the round record: the same record and seed SHALL give the same events. Every destroyed ship SHALL be hit by a kill shot from the side that did most of the damage, landing as it dies; every boarded ship SHALL be reached by boarding pods first.

#### Scenario: A ship is destroyed
- **WHEN** the round destroyed a ship
- **THEN** an enemy shot lands on it as it explodes and leaves drifting wreckage

#### Scenario: A ship is boarded
- **WHEN** the round's boarders took a ship
- **THEN** pods fly to it, it vents while crippled, and it joins the captors' rear in their colours

### Requirement: Health bars and the fleet strength meter
Each ship SHALL show a health bar in its fleet's colour, green above 60%, amber above 30%, red below, flickering while crippled, wider for capital ships; its health SHALL run from the damage it carried into the round to the damage it carries out. A top-centre meter SHALL show each fleet's share of its starting strength with a verdict and trend.

#### Scenario: Who is winning
- **WHEN** one fleet holds more than 58% of the two fleets' strength
- **THEN** the meter reads Winning for it, Losing below 42%, Even fight between, with an up or down arrow as its share moves

#### Scenario: The battle ends
- **WHEN** the round leaves one side with no ships, or a fleet sails away
- **THEN** the meter reads Victory, Defeat, Broke off, or Pursued when a faster foe gives chase

### Requirement: The battle HUD and leaving the view
The view SHALL show the round, the range band and the countdown to the next round, a Retreat button for your own fleet and a Back button; Esc SHALL leave the view. The camera SHALL follow the fleets and pull back as they stand apart.

#### Scenario: Retreating from the view
- **WHEN** the player presses Retreat in the view of their own fleet's battle
- **THEN** the retreat order is given, and when the round ends the fleet turns away and the meter reads Broke off

#### Scenario: Leaving
- **WHEN** the player presses Back or Esc
- **THEN** the map is shown again as it was

### Requirement: The battle view on phones
On narrow screens the meter SHALL sit under the top bar instead of over the panels, the HUD SHALL fit a 390 by 844 screen with no horizontal scroll, and touch SHALL turn the camera with one finger and zoom with a pinch.

#### Scenario: Watching on a phone
- **WHEN** the view is open on a 390 by 844 touch screen
- **THEN** the meter, health bars and dock fit, one finger turns the camera and a pinch zooms

### Requirement: Each ship is a squadron
The battle view SHALL draw every ship the rules count as its squadron: as many hulls as its size stands for (ship-squadrons), in close formation. A squadron SHALL fire, take hits, carry one health bar and be boarded as one ship; its hulls SHALL go up one by one as its health falls, and the rest together when it is destroyed.

#### Scenario: A Lancer squadron lost
- **WHEN** the round destroys one Lancer (a frigate) of a fleet
- **THEN** its remaining hulls of four explode in quick succession, and the fleet's Lancer count drops by one
