## ADDED Requirements

### Requirement: Building art styles
Building pictures SHALL be shown in the viewer's chosen art style: Rendered (the 3D model), Pixel, Ink or Marker. The default SHALL be Ink. The choice SHALL be kept in the viewer's browser only and SHALL NOT change any game state.

#### Scenario: A new viewer
- **WHEN** a viewer has never picked a style
- **THEN** buildings are shown in Ink

#### Scenario: Switching style
- **WHEN** the viewer picks Pixel on the Building art card
- **THEN** every building picture on screen shows its pixel art, and the choice holds after a reload

### Requirement: Every building drawn
Each drawn style SHALL have a picture for every building and for the capitol, at the style's size (Pixel 64 px, Ink and Marker 128 px). A picture that fails to load SHALL fall back to the rendered model.

#### Scenario: A new building
- **WHEN** a building is added to the content table without its drawn pictures
- **THEN** the art style test fails
