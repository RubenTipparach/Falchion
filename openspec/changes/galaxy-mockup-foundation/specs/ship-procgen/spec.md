# Spec Delta

## Purpose

Generates every ship's 3D model procedurally from a compact design description so ships are unique, cheap to share between players, and extensible with new styles.

## ADDED Requirements

### Requirement: Five ship styles
The system SHALL provide procedural generators for organic, technological, aesthetic/classic, simple geometry and utilitarian ship styles, each with a visually distinct silhouette language.

#### Scenario: Style list
- **WHEN** the available ship styles are listed
- **THEN** all five styles are present

### Requirement: Deterministic models
The same ship design (style, seed, parameters, traits) SHALL always produce the same model, so only the design needs to be stored or sent over the network.

#### Scenario: Regenerate
- **WHEN** a design is generated twice
- **THEN** both models have identical part layout

### Requirement: Pluggable styles
New ship styles SHALL be addable by registering a new generator, without changing existing generators or callers.

#### Scenario: Register a style
- **WHEN** a new generator is registered under a new style id
- **THEN** the designer lists it and designs with that style use it
