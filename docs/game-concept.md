# Milton Estates Game Concept

## Premise

*Milton Estates* is a standalone 2D top-down neighborhood exploration game about childhood friendship, small mysteries, and the adventure hidden in familiar places. The first mission follows Billy and his friends Andrew and Jeremy through a compressed, fictionalized version of their Lititz, Pennsylvania neighborhood as they search for a missing Xbox controller.

The game should capture the warmth of a classic handheld-era adventure RPG while using entirely original characters, artwork, maps, buildings, interface elements, dialogue, and gameplay content.

## Player Fantasy

The player gets to be a middle-school kid on a bright summer afternoon, free to wander lawns, talk with friends, follow half-helpful clues, and turn a modest neighborhood errand into an expedition through the creek woods. Exploration should feel inviting rather than dangerous: the pleasure comes from noticing details, knowing shortcuts, and uncovering secrets in a place that feels lived in.

## Setting and Tone

The first playable area is the southern corner of Milton Estates near Fruitville Pike, centered on a compact section of Wheatfield Drive. Three important homes face Wheatfield Drive in this order:

1. Andrew's white house
2. Billy's blue house with white trim
3. Jeremy's baby-blue house with red shutters

The creek enters behind Billy's house and continues north, roughly parallel to Wheatfield Drive. The childhood route into the woods passes between Billy's house and the neighboring property toward Andrew's house. Distances and lot geometry may be compressed or rearranged for readable exploration while preserving these relationships.

The broader world includes Bent Creek, Stonehenge, Reidenbaugh Elementary, and Fruitville Pike. In the first demo they appear only through signs, distant views, fields, golf-course scenery, or blocked exits. The atmosphere is green, semi-rural, colorful, peaceful, and nostalgic, with mature trees and surrounding farmland.

## Mission-Based Playable Characters

Playable characters are selected by mission rather than being a single permanent avatar. Billy is the playable character in **The Missing Controller**. Later missions may star Andrew, Jeremy, or other characters, allowing stories to revisit shared places from different perspectives.

Character-specific content should be data-driven where practical. Movement and interaction systems remain shared; missions provide the playable character, starting location, dialogue role, quest state, and any mission-specific abilities or rules.

## Core Loop

1. Explore a compact neighborhood or nature area.
2. Talk to friends and inspect points of interest.
3. Receive clues and track a simple objective.
4. Search the environment and discover an item, route, or secret.
5. Return to a character or location to resolve the mission.
6. Receive a brief character-driven payoff and record completion.

There is no combat in the first mission. Movement, conversation, observation, and discovery are the primary verbs.

## First Quest: The Missing Controller

Billy begins near his house. Jeremy explains that his Xbox controller is missing and suspects Andrew hid it. Andrew offers a vague, teasing clue. Searching around the three houses reveals clues that lead behind Billy's house, through the gap toward Andrew's neighboring property, and into the creek woods. Billy finds the controller concealed in tall grass near the creek, returns it to Jeremy, and the three friends close the mission with a humorous exchange.

The quest introduces movement, NPC interaction, dialogue, quest tracking, environmental searching, interactable objects, tall-grass exploration, item collection, and quest completion. One optional secret or collectible rewards players who explore beyond the direct clue trail.

## First Demo Scope

The demo contains:

- One compressed section of Wheatfield Drive with a bend or intersection
- The recognizable exteriors, lawns, driveways, and landscaping of the three houses
- Billy, Andrew, and Jeremy as original cartoon characters
- A route behind the houses and a small connected creek-woods exploration area
- Tall grass containing the hidden controller
- One complete quest and one optional secret or collectible
- Clearly blocked or implied routes toward Bent Creek, Stonehenge, Reidenbaugh Elementary, and Fruitville Pike
- Basic movement, interaction prompts, dialogue, quest state, inventory pickup, save/load, and completion feedback

## Non-Goals for the First Demo

- Combat, enemies, or character progression systems
- House interiors, vehicles, day/night cycles, or a continuous full-scale Lititz map
- Access to the surrounding neighborhoods or school
- Online accounts, multiplayer, analytics, or required backend services
- Photorealistic reconstruction or exact simulation of real properties
- A general-purpose quest engine designed for every possible future mechanic

## Art, Originality, and Privacy

The visual style is an original top-down three-quarter cartoon perspective with readable silhouettes, expressive small sprites, colorful summer vegetation, exaggerated landmarks, and strong separation between roads, lawns, buildings, trees, and water. It may evoke the accessibility and charm of classic handheld adventures, but must not copy any franchise's assets, characters, creatures, tile layouts, interface, or distinctive visual language.

Real neighborhood and street names may be used, including Wheatfield Drive and the surrounding named areas. Exact house numbers, lot geometry, private details, and minor-road placement should be omitted or deliberately fictionalized. Reference photographs guide broad atmosphere, color, and architectural character only; final buildings and characters should be stylized composites rather than traceable replicas or photorealistic likenesses.

## Technical and Maintainability Principles

- Build with Phaser, TypeScript, and Vite for a desktop-browser-first experience with keyboard controls.
- Author maps in Tiled and keep dialogue, quests, characters, and items in small validated local JSON files.
- Store saves locally with LocalStorage initially; introduce IndexedDB only if actual data needs justify it.
- Require no backend for the first version.
- Separate reusable game systems from mission content without creating speculative frameworks.
- Prefer explicit scene responsibilities, typed data boundaries, stable identifiers, and small modules over hidden coupling or deep inheritance.
- Keep map objects and content data authoritative; avoid hard-coding quest coordinates or dialogue state throughout scene code.
- Include lightweight automated checks for data validity and deterministic quest-state transitions.
- Use placeholders early, but keep asset naming, scale, origins, collision conventions, and import paths consistent so final art can replace them safely.

## Demo Success Criteria

The first demo succeeds when a new player can:

- Load the game in a desktop browser and understand movement and interaction without outside instructions.
- Recognize the three-house sequence and find the creek entrance naturally from dialogue and environmental clues.
- Complete the full controller quest without broken or contradictory quest states.
- Discover the controller through active exploration rather than a purely linear cutscene.
- Save and resume locally without losing completed progress.
- Experience a stable, readable, warm neighborhood scene that feels personal without exposing exact private-property details.
- See a code and content structure that can support another mission with a different playable character without duplicating core systems.
