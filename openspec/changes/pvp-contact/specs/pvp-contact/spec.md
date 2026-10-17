## ADDED Requirements

### Requirement: A fleet with warships can be set aggressive
A fleet with warships SHALL be settable to aggressive from its fleet card. The stance SHALL be kept in the fleet's orders on the server and in the browser, and a fleet SHALL be passive unless set. Fleets without warships SHALL NOT offer the stance, and the rules SHALL refuse it for them.

#### Scenario: Setting a warfleet aggressive
- **WHEN** a player turns Aggressive on for a fleet with warships
- **THEN** the fleet's orders carry the aggressive stance until it is turned off

#### Scenario: An unarmed fleet stays passive
- **WHEN** an order sets an aggressive stance on a fleet with no warships
- **THEN** the fleet stays passive

### Requirement: Fleets of two players fight at sea when one attacks
Two fleets of different empires on the same hex, both on station, SHALL fight when their empires are at war (see player-diplomacy) and at least one is aggressive and armed. Two passive fleets SHALL NOT fight, and an unarmed fleet SHALL NOT start a fight.

#### Scenario: Passive fleets pass
- **WHEN** two passive fleets of different players stop on the same hex
- **THEN** no battle is fought

#### Scenario: An aggressive fleet attacks
- **WHEN** an aggressive armed fleet is on the same hex as a passive fleet of another player
- **THEN** the two fleets fight that year

### Requirement: A battle is a round a year until one side is gone or breaks off
A battle at sea SHALL be fought one round per world year (one real minute) while the fleets stay on the same hex and one still attacks. Each round SHALL destroy at least one ship, and the range SHALL close over the rounds. Either fleet SHALL be able to retreat at any time, which sends it to the nearest friendly system at once and ends the battle; its owner's fleet card SHALL show the battle and its round with a Retreat button.

#### Scenario: A drawn-out fight
- **WHEN** two evenly matched fleets fight for three years
- **THEN** three rounds are fought, each costing at least one ship, and the dispatches count the rounds

#### Scenario: Breaking off
- **WHEN** the defender presses Retreat between rounds and the attacker's ships are no faster
- **THEN** its fleet sets course for the nearest friendly system and no further round is fought

### Requirement: Fleets chase by moving, at their own speed
A fleet with warships SHALL be able to chase another player's fleet: each year it steers for where that fleet will be a year later, at its own speed, and a round SHALL be fought whenever the two are on the same hex, under way or not. A faster chaser SHALL close in and catch up; a slower one SHALL catch up only once its quarry stops long enough. An aggressive fleet whose foe breaks off SHALL give chase on its own. Any other course SHALL end a chase.

#### Scenario: Run down
- **WHEN** a fleet retreats from an aggressive enemy whose empire has faster drives
- **THEN** the enemy chases it, closes the gap over the years and fights it where it catches it

#### Scenario: A slow chaser
- **WHEN** a player orders a slower fleet to chase an enemy fleet that keeps moving
- **THEN** it does not catch up until the enemy fleet stops long enough for it to arrive

### Requirement: The battle is the same for both sides
The battle SHALL run the game's combat rules with each side's warships, research bonuses and ammunition-scaled firepower. It SHALL be deterministic in both fleets (owner and id) and the year, whichever empire is named first. Each empire's save SHALL record its own losses and a dispatch naming the other fleet and its empire, with those names bounded. Both empires SHALL have played exactly to that year.

#### Scenario: A round's losses
- **WHEN** an aggressive fleet of six interceptors meets six interceptors
- **THEN** at least one ship is lost between them, and each empire's dispatch names the other fleet and empire

#### Scenario: An empire behind the year does not fight
- **WHEN** one of the two empires has not been played to the year of the contact
- **THEN** no battle is fought that year

### Requirement: The server resolves contacts each year
After every empire is played forward in a world year, the server SHALL find contacts from the stored public views and resolve each pair with both empires locked in id order. It SHALL store both results or neither, publish both public views and tell both owners. A fleet SHALL take part in at most one battle per year, and a year's battles SHALL be fought once even if the year is ticked again.

#### Scenario: Two empires meet
- **WHEN** player B's aggressive fleet and player A's passive fleet are on one hex in year N
- **THEN** both empires' saves record the battle for year N and both owners are told

#### Scenario: A year ticked twice
- **WHEN** the server ticks year N a second time
- **THEN** no battle of year N is fought again

#### Scenario: A failed save
- **WHEN** the second empire's save cannot be stored
- **THEN** the first empire's save is put back and neither owner is told of the battle

### Requirement: Public views show armed and stance
Each fleet in another player's public view SHALL say whether it has warships and whether it is aggressive. The server SHALL sanitise both fields, and the map and fleet card SHALL show another empire's armed fleets as a warfleet or an aggressive warfleet.

#### Scenario: Seeing an aggressive fleet
- **WHEN** a player looks at another empire's aggressive fleet with warships
- **THEN** its map label and fleet card show it as an aggressive warfleet
