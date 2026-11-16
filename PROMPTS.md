# The prompts

These are the prompts that produced everything in this repository, in order, exactly as they were typed
into [Claude Code](https://claude.com/claude-code) (typos included). No code was written by hand.

Claude also asked a few multiple-choice questions along the way (which music track, which voice, whether to
publish); those answers are not listed.

## 1. Two links

> https://github.com/academa-labs/manimgx

> https://github.com/ppmpreetham/BUI

## 2. The question

> https://github.com/ppmpreetham/BUI
>
> can we use both together

## 3. The island generator (`app.py`, `world.py`, `render_job.py`)

> go ahead we can make thing similar to minecraft

## 4. Understanding what is possible

> help me understand potential one by one step by step so I can imagine dream and breathe with it

## 5. The film (`film.py`)

> before I dream big lets build one creative peice that can show me potential

## 6. The living world (`web/`)

> # Project: A Living Voxel World
>
> You are a senior creative developer specializing in procedural 3D graphics, simulation, and interactive web experiences.
>
> ## Starting point
> Inspect my existing project and understand its rendering approach, scene structure, asset generation, animation pipeline, and seasonal variants. Preserve the existing working implementation and build on top of it.
>
> ## Objective
> Transform the existing voxel island into a living miniature world that users can observe and interact with.
>
> ## Requirements
>
> 1. **Continuous world simulation**
>    - Create a coherent day/night cycle with adjustable time speed.
>    - Transition smoothly between spring, summer, autumn, and winter.
>    - Make trees, grass, flowers, water, and other vegetation respond to seasons.
>    - Add animated water, drifting clouds, wind, and subtle environmental motion.
>    - Add weather states such as clear skies, rain, fog, and snowfall.
>
> 2. **A world with life**
>    - Introduce small inhabitants, birds, or other suitable animated entities.
>    - Give entities simple, believable movement and behavior.
>    - Use deterministic simulation where practical so the scene can be reproduced.
>
> 3. **Interactive controls**
>    - Add a compact, polished control panel for season, time, weather, and animation speed.
>    - Allow users to pause, resume, reset, and capture the current scene.
>    - Keep the island visible while controls are used.
>
> 4. **Visual quality**
>    - Preserve the charming voxel aesthetic.
>    - Use cohesive lighting, shadows, atmospheric depth, and smooth transitions.
>    - Create a strong opening composition with an intentional camera angle.
>    - Avoid excessive UI, visual clutter, and distracting animation.
>
> 5. **Engineering quality**
>    - Inspect the current stack before choosing new dependencies.
>    - Reuse existing components and assets where appropriate.
>    - Separate rendering, simulation, configuration, and UI logic.
>    - Avoid unnecessary rerenders, memory leaks, and per-frame allocations.
>    - Handle loading, resizing, errors, and unsupported graphics capabilities gracefully.
>
> ## Execution instructions
>
> First inspect the repository, identify the entry points and current capabilities, and propose a concise implementation plan. Then implement the actual experience, run the available checks, and fix any issues you discover.
>
> Do not stop after generating a plan or a static mockup. The deliverable must be a functioning interactive experience.
>
> At completion, report what works, how to run it, which files changed, and any remaining limitations.

## 7. The city builder (`web/city/`)

> # Project: Miniature City Builder
>
> Build a polished, playable isometric city-building game using the existing project as a technical reference, not as a limitation.
>
> ## Core experience
> Users start with an empty island and gradually build a tiny city. They can place roads, houses, trees, parks, bridges, and other structures directly onto the terrain.
>
> ## Gameplay requirements
> - Click or tap terrain cells to select build locations.
> - Display a placement preview before confirming construction.
> - Prevent invalid placements and buildings that overlap incorrectly.
> - Support moving, rotating, removing, and replacing buildings.
> - Introduce a simple economy with money, population, and happiness.
> - Let roads connect buildings and make population growth depend on basic infrastructure.
> - Add a simulation speed control, pause button, and reset option.
> - Persist city state locally and restore it after refreshing the page.
>
> ## Visual requirements
> - Create a cohesive voxel art style with consistent dimensions and lighting.
> - Make terrain, roads, water, and buildings visually distinct.
> - Add subtle animations to water, trees, vehicles, or inhabitants.
> - Provide clear visual feedback for valid and invalid placements.
> - Design a beautiful initial city and a useful building palette.
>
> ## Architecture
> Separate the world grid, terrain, building definitions, placement validation, economy simulation, persistence, and UI.
>
> Use the existing rendering stack if it is appropriate. If the project is not currently interactive 3D, evaluate a suitable browser-based 3D library before introducing dependencies.
>
> Implement a working vertical slice first: select a building, place it, see it in the world, and save the result. Then add the economy and polish.
>
> Inspect the repository, implement the experience, run available checks, and verify the complete placement and save/load flows. Do not deliver a static concept screen pretending to be a game.

## 8. The video (`video/`)

> can we record a video about it that how we built this using claude and at last we ask viewer comment claude to get repo links and prompt for it

> lets focus on adding audio to that video look for open soure music we may add voice as well if you feel that will fit good

> lets try adding voice as well you can have windows one but before that I want you try some good open source out there

> Nice I would ask onre more round of review and polishing
