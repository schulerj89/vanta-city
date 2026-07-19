<!-- GENERATED from narrative/ashfall-story-bible.json. Do not edit directly. -->

# Ashfall: The Cinder Ledger — Narrative Bible

In autumn 1997, a wary courier known as Rook returns to a salt-bitten port city and discovers that a missing teenager, a false municipal debt, and a chain of staged accidents are entries in the same ledger; surviving means deciding whether Ashfall belongs to the people who remember it or the people who can price it.

## Canon authority

- **Setting:** Ashfall City, September 29–November 7, 1997
- **Canonical source:** `narrative/ashfall-story-bible.json`
- **Playable entity:** `casual`
- **Player dialogue identity:** `rook` (alias only; never a second playable definition)
- **Existing NPC/speakers:** `mack`, `della-voss`, `nox`, `raze`
- **Runtime boundary:** This bible is planning data only. It is not imported by runtime startup, does not register entities or listeners, and does not claim unimplemented systems.

## Setting, history, and pressure

Ashfall is a fictional Atlantic port built where a tidal channel meets steep industrial ground. Salt, coal dust, wet concrete, and faded geometric facades define its streets. A 1984 channel fire hollowed out the manufacturing base; a 1992 storm then gave lenders and city receivers an excuse to convert repair debt into property control. By 1997 the city still works, but every shift, lease, and favor carries two prices: the one printed on paper and the one enforced at the curb.

### Northbar Coach Depot (`northbar-coach-depot`)

The city built Northbar at the northern cut in 1971 to separate intercity coaches from quay freight. Its glazed-brick waiting hall and sawtooth bays survived the channel fire, but Marrow Transit now leases the baggage counter as contract overflow and quietly copies the paper traffic passing through it.

- **Current status:** Implemented as the separate northbar-coach-depot opening level for the 46.9-second cinematic.ash-001.opening, with authored geometry and collision, grounded blocking marks, camera anchors, local props and wagon paths, production Mack and Della, adaptive-sector pins, composition preflight, and an atomic cross-level landing into test-district.
- **Current pressures:** Marrow uses its baggage-counter lease to connect passenger manifests with vehicles and garage accounts.; The shrinking coach schedule gives an arriving traveler only one early eastbound chance to leave Ashfall the same morning.; Mack must collect Rook without revealing why Orin summoned an outside courier.

### Ashfall Junction (`ashfall-junction`)

The Junction formed where foundry shifts crossed the channel road. Its street grid survived the 1984 channel fire, but the surrounding workshops became repair yards, storage rooms, and informal offices. The signal cabinet still bears layers of municipal paint from administrations that never replaced its wiring.

- **Current status:** Implemented as level test-district at WORLD-003's current 87.5m by 70m bounds with 6,125 square metres, 25 structures, 14 adaptive-streaming sectors, authored roads and collision, the East Quay curve, Contact Yard, seven deterministic civilian vehicle types, pedestrians, minimap, and full-map data.
- **Current pressures:** Recovery Office survey crews are reclassifying occupied workshops as unsafe vacancies.; Straight-through traffic and perimeter closures make the intersection easy to watch and hard to leave unnoticed.; Mack's garage network is one late payroll away from accepting predatory financing.

### Cinder Quay (`cinder-quay`)

A stepped seawall and bonded warehouses once moved machine parts around the clock. After the channel fire, insurers fenced the deepest berths and leased the remaining sheds through shell operators.

- **Current status:** Canon location planned for a later world milestone; WORLD-001 did not build the canonical quay, and no current level geometry, trigger, traffic lane, or cinematic anchor exists.
- **Current pressures:** A contested night manifest proves usable berths are being declared derelict before forced sale.; Tidehands crews are split between protecting work and taking private unloading contracts.; Recovery Office inspectors can close the quay by noon if a staged safety failure holds.

### Glasshouse Row (`glasshouse-row`)

Small print shops, repair counters, and boarding rooms filled the lee side of the old tram grade. Its narrow businesses became the city's unofficial copy room when official archives started losing inconvenient pages.

- **Current status:** Canon location only; requires authored district expansion, interiors or exterior service windows, interaction points, and NPC schedules.
- **Current pressures:** A print cooperative is reproducing deed notices faster than receivers can seize originals.; Public pay phones are being removed under a modernization contract, cutting the district's private communications.; Nox's courier routes are compromised by an unknown pager-code leak.

### Reservoir Steps (`reservoir-steps`)

Concrete stairs and service roads climb to the capped municipal reservoir. The upper pump house became a records annex after the 1992 storm flooded City Hall's basement.

- **Current status:** Canon finale district only; requires vertical traversal, authored collision, production security NPCs, record interactions, and performance-reviewed sector streaming.
- **Current pressures:** The annex holds the only surviving index that connects repair bonds to property seizures.; Private security has replaced clerks on the night shift.; A forecast king tide threatens lower streets before the final hearing.

## Themes and tone boundaries

- **Memory versus paper:** A neighborhood remembers who kept it alive; an institution recognizes only what can be stamped, filed, and sold. The drama tests whether either kind of truth can survive alone.
- **Debt as government:** Ashfall is controlled less by uniforms than by overdue notices, repair liens, payroll gaps, and favors. Crime and civic administration use the same arithmetic with different letterhead.
- **Loyalty with receipts:** Care is real, but every character has learned to document, price, or deny it. Trust changes when someone accepts a cost they cannot recover.
- **Motion and belonging:** Rook survives by leaving before a place can claim them. Ashfall forces a choice between remaining unowned and becoming responsible for somewhere imperfect.

**Tone boundaries**

- Crime is tense, local, and consequential; violence is never a carnival, civilian suffering is not a punchline, and cruelty does not substitute for characterization.
- Humor comes from dry observation, stubborn logistics, and clashing habits—not humiliation, stereotypes, or broad parody.
- Dialogue stays concise and subtitle-friendly. Characters avoid exposition speeches, modern meme phrasing, and borrowed genre catchphrases.
- Police, labor, business, and neighborhood groups contain competing people rather than uniform moral categories.
- No real brands, cities, public figures, songs, criminal organizations, or recognizable franchise plots are named or imitated.
- The story may show threats, debt coercion, property crime, smuggling, arson aftermath, and defensive violence, but it avoids sexual violence, torture spectacle, hate-crime set pieces, and harm to children as entertainment.
- The 1990s are material conditions rather than nostalgia wallpaper: information moves slowly, records can be lost, and a missed call changes plans.

## Factions

### Ashfall Recovery Office (`recovery-office`)

- **Goal:** Consolidate storm and fire liabilities into a single saleable redevelopment parcel; Keep the bond-transfer chain legal-looking until the November hearing
- **Resources:** Inspectors and closure notices; Debt records and municipal seals; Contract security through Marrow Transit; Access to condemned properties
- **Methods:** Selective code enforcement; Purchased debt; Staged safety failures; Offers that turn witnesses into beneficiaries
- **Relationships:** Uses Marrow Transit as deniable muscle; Pressures Mack's garage through liens; Courts Raze as a future public spokesman; Underestimates Nox's paper network

### Tidehands Local 14 (`tidehands-local`)

- **Goal:** Keep the remaining quay shifts under worker control; Prevent the berth closures from becoming permanent
- **Resources:** Dock access and load knowledge; Forklifts, keys, and shift rosters; Families across four districts
- **Methods:** Work slowdowns; Mutual aid; Selective off-book freight; Collective witness when leadership agrees
- **Relationships:** Relies on Mack for vehicle repair; Distrusts Raze's clean public strategy; Trades route warnings with Nox; Contains a paid Recovery Office informant

### Marrow Transit & Recovery (`marrow-transit`)

- **Goal:** Own the city's towing, impound, and bonded-haul routes; Acquire waterfront parcels as payment for municipal contracts
- **Resources:** Tow yards and dispatch radios; Drivers and private guards; Civilian-looking fleet access; Signed emergency contracts
- **Methods:** Strategic towing; Cargo substitution; Threats framed as service calls; Short, deniable road blockades
- **Relationships:** Paid by the Recovery Office; Competes with Tidehands crews; Attempts to recruit Rook; Holds evidence about the 1984 fire that can damage its own founders

### Glasshouse Copy Cooperative (`glasshouse-cooperative`)

- **Goal:** Keep public records reproducible and locally accessible; Expose the false vacancy chain without sacrificing vulnerable tenants
- **Resources:** Print rooms and fax lines; Volunteer indexers; Nox's courier routes; A cassette archive of public meetings
- **Methods:** Distributed copies; Anonymous tips; Document comparison; Public release timed to hearings
- **Relationships:** Protects Nox but questions his secrecy; Needs Raze's public credibility; Treats Rook as a courier until Rook chooses responsibility; Cannot act on stolen records without corroboration

### Junction Garages (`junction-garages`)

- **Goal:** Keep independent repair bays operating; Find Mack's missing nephew Orin before either side can use him
- **Resources:** Tools, lifts, and keys; Knowledge of vehicle histories; Favors from drivers; Mack's reputation for finishing difficult work
- **Methods:** Repair credit; Quiet storage; Vehicle identification; Refusal to service coercive crews
- **Relationships:** Supports Tidehands vehicles; Owes Marrow Transit money; Hides Glasshouse materials; Becomes Rook's first fragile home base

## Recurring cast

### Rook (`rook`)

- **Speaker / entity:** `rook` / `casual`
- **Goal:** Collect the promised courier fee, find Orin, and leave Ashfall before an old failure becomes public.
- **Pressure:** Rook's cash reserve is thin, Marrow Transit recognizes their driving habits, and Mack knows why Rook left in 1992.
- **Contradiction:** Rook insists every job is temporary but memorizes people, routes, and small needs with the care of someone building a home.
- **Leverage:** Exceptional route memory, calm under pursuit, and a sealed cassette from the 1992 storm that Rook has never played for anyone else.
- **Relationship change:** Begins as Mack's paid outsider, becomes Nox's accountable partner, refuses Raze's clean exit, and ends responsible for what Ashfall does with the ledger.
- **Gameplay function:** Playable viewpoint, courier, investigator through movement and interaction, eventual driver, and the owner of mission, money, equipment, and persistent choice state.
- **Arc:** From mobility as self-protection to chosen obligation without romanticizing ownership or crime.
- **Voice:** Short declarative replies; notices practical details; asks one precise question instead of explaining a feeling. Under pressure, sentences get quieter rather than louder.
- **Visual dependency:** Use authoritative playable entity casual and its existing local CC0 model. Rook-specific wardrobe, portrait, or props remain optional original-project-owned art dependencies and must not replace the registry ID.

### Mack Bell (`mack`)

- **Speaker / entity:** `mack` / `mack`
- **Goal:** Recover his nephew Orin and keep the Junction garages independent through the hearing.
- **Pressure:** A repair lien comes due in ten days, his crews are losing work, and admitting how Orin got the ledger could incriminate a friend.
- **Contradiction:** Mack demands punctual honesty while hiding the one delay and one lie that sent Orin into danger.
- **Leverage:** Vehicle histories, shop keys, repair credit, and trust across trades that do not otherwise cooperate.
- **Relationship change:** Treats Rook as an unreliable tool, then as a partner, and finally accepts that protection without truth is another form of control.
- **Gameplay function:** First mission giver, grounded tutorial relationship, garage access gate, vehicle identification source, and emotional measure of Rook's reliability.
- **Arc:** From guarding people through omission to risking the garage by giving them the whole record.
- **Voice:** Concrete nouns, mechanical comparisons, dry three-beat corrections; rarely uses a name when a task will do.
- **Visual dependency:** Preserve production NPC ID mack, character ID npc-worker, spawn spawn.npc-mechanic, close camera profile, and existing local CC0 model. Mack is already in productionNpcDefinitions; portrait remains optional.

### Nox Arlen (`nox`)

- **Speaker / entity:** `nox` / `nox`
- **Goal:** Build enough redundant evidence that no single raid, fire, or frightened witness can erase the seizure scheme.
- **Pressure:** A compromised pager code exposes couriers, while the cooperative suspects Nox values perfect proof more than living people.
- **Contradiction:** Nox distributes documents to prevent centralized power but hoards the index that makes the copies meaningful.
- **Leverage:** Pay-phone timing, copy routes, document comparison, and knowledge of which official records were altered after filing.
- **Relationship change:** Dismisses Rook as another vanishing courier, then trusts Rook with the master index after Rook returns when escape is available.
- **Gameplay function:** Evidence-chain mission giver, route and stealth-pressure planner, dialogue source for paper-trail objectives, and owner of copy-network facts.
- **Arc:** From control through redundancy to trust through shared custody.
- **Voice:** Compressed warnings and exact times; avoids adjectives; repeats the key noun when someone is evading the point.
- **Visual dependency:** Preserve NPC ID nox, character ID npc-hoodie, spawn spawn.npc-alley, and existing local CC0 model. Production scheduling and a reviewed portrait are unresolved dependencies.

### Raze Calder (`raze`)

- **Speaker / entity:** `raze` / `raze`
- **Goal:** Force a public settlement that keeps the quay open without turning the Tidehands into a criminal organization.
- **Pressure:** Every illegal load weakens his hearing strategy, while every lawful delay costs another shift and another family.
- **Contradiction:** Raze prizes collective consent but privately decides which truths the membership is ready to hear.
- **Leverage:** Shift loyalty, public composure, access to berth operations, and a legitimate seat at the November hearing.
- **Relationship change:** Sees Rook as reckless noise, uses Rook's evidence, then breaks with Rook over whether to trade the ledger for immediate jobs before choosing disclosure.
- **Gameplay function:** Quay access gate, pressure-versus-proof countervoice, timed worksite mission giver, and public consequence carrier.
- **Arc:** From protecting the institution's image to letting members choose with full knowledge of the risk.
- **Voice:** Measured clauses and clear alternatives; never wastes a threat; anger appears as unusually formal courtesy.
- **Visual dependency:** Preserve NPC ID raze, character ID npc-punk, spawn spawn.npc-deck, wide camera profile, and existing local CC0 model. Production use requires roster promotion and authored quay placement.

### Orin Bell (`orin-bell`)

- **Speaker / entity:** `orin-bell` / `orin-bell`
- **Goal:** Prove the garage can survive without Mack deciding every risk and expose the seizure chain he found in impounded vehicle records.
- **Pressure:** Both Marrow Transit and the Recovery Office need his copied ledger, and his improvised hiding plan is running out of safe contacts.
- **Contradiction:** Orin resents being protected like a child but chose a plan that depends on older people understanding his clues.
- **Leverage:** A partial tow ledger, first-hand knowledge of substituted vehicle plates, and the missing page that ties a staged collision to a parcel transfer.
- **Relationship change:** Begins as Rook's absent obligation, rejects rescue without agency, and becomes a junior custodian of the evidence rather than a prize to retrieve.
- **Gameplay function:** Mystery target, breadcrumb author, later mobile witness, and source of the physical ledger-page objective.
- **Arc:** From solitary proof-seeking to disciplined participation in a shared evidence chain.
- **Voice:** Fast practical lists, over-specific alibis, and humor that arrives one beat after danger; drops the performance when Mack apologizes plainly.
- **Visual dependency:** Requires an original-project-owned or license-approved production NPC model, portrait metadata, animations, entity definition, and authored spawn; no placeholder qualifies.

### Vera Sorn (`vera-sorn`)

- **Speaker / entity:** `vera-sorn` / `vera-sorn`
- **Goal:** Complete the parcel consolidation before the bond review exposes that the Recovery Office built solvency on fabricated vacancies.
- **Pressure:** Her superiors will disown the methods if the sale fails, and Marrow Transit has kept copies of orders she expected to remain verbal.
- **Contradiction:** Vera genuinely believes Ashfall needs capital and safe buildings, yet treats existing residents as accounting errors when they obstruct her timetable.
- **Leverage:** Closure authority, debt assignments, access to the annex, and the ability to make selective amnesty offers that divide allies.
- **Relationship change:** Initially offers Rook anonymous paid work, then recognizes Rook as the evidence chain's human weak point, and finally offers a lawful-looking compromise that would save jobs while preserving the fraud.
- **Gameplay function:** Primary institutional antagonist, source of escalating world pressure, negotiation counterparty, and final choice catalyst rather than a combat boss.
- **Arc:** From invisible administrative certainty to public accountability, with her central argument remaining materially tempting.
- **Voice:** Patient, exact, and professionally warm; converts moral claims into deadlines and liabilities; never uses slang to manufacture menace.
- **Visual dependency:** Requires an original-project-owned or accepted-license production NPC model, restrained office/worksite wardrobe, portrait, idle/interaction animation, and cinematic-ready facial readability within the low-poly style.

### Della Voss (`della-voss`)

- **Speaker / entity:** `della-voss` / `della-voss`
- **Goal:** Keep Marrow Transit's contracts profitable enough to survive while preventing Vera from making the company the scheme's disposable culprit.
- **Pressure:** Drivers are withholding dispatch tapes, Tidehands can close her routes, and the 1984 fire record implicates the company's founders.
- **Contradiction:** Della insists every deal is voluntary while engineering circumstances in which refusal becomes ruin.
- **Leverage:** Dispatch schedules, impound access, temporary road control, and proof that can expose Vera or destroy Mack.
- **Relationship change:** Tests Rook with a paid delivery, grows to respect Rook's refusal to be owned, and ultimately loses control when her own drivers provide corroboration.
- **Gameplay function:** Street-level antagonist, vehicle-route pressure owner, alternate information source, and recurring negotiator who makes nonviolent compromise costly.
- **Arc:** From controlling every exit to discovering that a network held together by coercion cannot keep a secret under shared risk.
- **Voice:** Friendly dispatch shorthand, conditional favors, and precise route names; answers accusations by offering a better price.
- **Visual dependency:** Preserve existing NPC and speaker ID della-voss. Her current production NpcDefinition uses pedestrian-street for Northbar and intentionally has no test-district spawn. NPC-002's contribution is limited to unplaced licensed candidates; MISSION-003B owns focal-character selection, NpcDefinition update, Northbar regression, and the venue mapping; portrait remains an accepted-license dependency.

## Three-act spine

### Act I: The Missing Page (`act-one-the-missing-page`)

Rook arrives for a simple pickup, finds Orin missing, and traces his route through the Junction to a copied tow ledger. The paper suggests that condemned properties, staged collisions, and Marrow Transit impounds share a numbering sequence.

- **Irreversible turn:** Rook gives Nox the only clean copy instead of selling it to Della; Marrow Transit identifies Rook publicly, closing the option of anonymous departure.
- **Relationship / risk / state change:** Mack moves from employer to implicated ally, Nox grants limited trust, and fact rook-known-to-marrow becomes true.

### Act II: The Price of Proof (`act-two-the-price-of-proof`)

The group must corroborate paper with people and places: a quay load, a dispatch tape, an occupied property listed as vacant, and Orin's testimony. Each proof requires risking the livelihoods the evidence is supposed to protect.

- **Irreversible turn:** Raze authorizes release of the berth roster after a staged safety incident injures a worker, trading short-term legal protection for proof the closure was ordered in advance.
- **Relationship / risk / state change:** The Tidehands split, Vera accelerates the annex purge, Mack admits his 1992 lie, and Rook stays after a clean route out becomes available.

### Act III: Who Owns the Record (`act-three-who-owns-the-record`)

Rook's coalition races the king tide and an administrative purge to assemble a public chain of custody. The final conflict is not possession of one magic document but whether enough independent holders speak together that no private bargain can erase them.

- **Irreversible turn:** Rook rejects Vera's parcel-saving private settlement and distributes the index before the hearing, making the truth impossible for any single ally—including Rook—to withdraw.
- **Relationship / risk / state change:** Ashfall wins time rather than a perfect victory; the garages and quay remain vulnerable but locally governed, while Rook accepts an accountable place in the network.

## Location glossary

- **`northbar-coach-depot` — Northbar Coach Depot level:** Opening-only intercity coach annex at Ashfall's northern cut, physically separate from the playable Junction. Runtime: Implemented opening level used by cinematic.ash-001.opening with authored geometry, collision, blocking marks, camera anchors, local props and wagon paths, production Mack and Della, and an atomic cross-level landing into test-district.
- **`test-district` — Ashfall Junction level:** Authoritative current level and fallback district label. Runtime: Implemented at WORLD-003's 87.5m by 70m current bounds; WORLD-004's proposed expansion and interiors are not yet runtime facts.
- **`zone.ashfall-junction` — Ashfall Junction zone:** The current 87.5m by 70m, 6,125-square-metre playable zone. Runtime: Implemented.
- **`landmark.signal-corner` — Signal Corner:** High-priority northeast landmark near the traffic light and controller. Runtime: Implemented.
- **`landmark.north-approach` — North Approach:** Rook's destination after the Northbar wagon transition and the default-spawn side of the Junction. Runtime: Implemented.
- **`landmark.east-approach` — East Approach:** Straight road exit useful for traffic observation. Runtime: Implemented.
- **`landmark.south-approach` — South Approach:** Approach near Nox's development fixture position. Runtime: Implemented.
- **`landmark.west-approach` — West Approach:** Approach near Mack's side of the Junction. Runtime: Implemented.
- **`interaction.signal-controller` — Signal controller:** Existing non-NPC inspect/use point at the northeast signal cabinet. Runtime: Implemented as an interaction location and consumed by the implemented MISSION-001 definition.
- **`mission.intersection-center` — Junction center mission point:** Existing mission-kind location at the crossing. Runtime: Implemented as level metadata only.
- **`trigger.intersection-center` — Junction center trigger:** Existing 12m crossing volume tagged future-mission. Runtime: Implemented as metadata; no general overlap mission owner exists.
- **`trigger.signal-corner` — Signal Corner trigger:** Existing northeast box volume near the signal controller. Runtime: Implemented as metadata; mission consumption is unimplemented.
- **`spawn.npc-mechanic` — Mack fixture spawn:** Authoritative current authored transform for Mack. Runtime: Implemented authored transform used by production Mack.
- **`spawn.npc-alley` — Nox fixture spawn:** Authoritative current authored transform for Nox. Runtime: Development fixture only; production roster promotion required.
- **`location.ashfall.night-venue` — Ashfall night venue:** A public after-hours room with two usable doors where Della can expose the original impound register without giving Nox private custody. Runtime: Roadmap location only; no current geometry is claimed. WORLD-004 owns the generic enterable interior, collision, camera-safe entrance, map/readiness data, authored lighting, and generic anchors; MISSION-003B owns Carbon Copy's interaction, story-participant integration, mission-specific marks/anchor bindings, evidence visuals, and prop paths.
- **`spawn.npc-deck` — Raze fixture spawn:** Authoritative current authored transform for Raze. Runtime: Development fixture only; production roster promotion required.
- **`cinder-quay` — Cinder Quay:** Bonded warehouses and the contested working berth. Runtime: Canon definition only; requires a later world milestone.
- **`glasshouse-row` — Glasshouse Row:** Print shops, boarding rooms, and distributed record network. Runtime: Canon definition only; world and interaction work unscheduled.
- **`reservoir-steps` — Reservoir Steps:** Uphill records annex and finale pressure corridor. Runtime: Canon definition only; later world milestone.

## Chronology and canon facts

- **October 18, 1984:** The channel fire destroys machine shops and closes the deepest quay berth. The official cause remains an electrical cascade; Marrow's founders moved insured cargo hours earlier.
- **March 1988:** The city creates temporary recovery liens. Temporary authority is renewed annually and becomes the Recovery Office's legal foundation.
- **September 2, 1992:** A storm floods the City Hall archive. Mack asks Rook to move a sealed records carton; Rook abandons the route after a collision and leaves Ashfall believing the carton was destroyed.
- **January 1994:** Vera Sorn begins consolidating repair bonds. Occupied workshops start appearing as vacant collateral.
- **August 1997:** Orin spots matching numbers in impound logs and parcel files while repairing a Marrow tow truck.
- **September 27, 1997:** Orin copies one ledger page, hides the index, and asks Mack to summon Rook as a courier outside local pressure networks.
- **September 29, 1997:** Rook arrives on the 5:42 a.m. coach at Northbar. Mack reveals that Orin has missed two nights; Della takes the passenger-manifest carbon; Rook gives up the 6:10 eastbound exit and rides with Mack to Ashfall Junction, where the surveillance-check mission becomes playable.
- **September 29, 1997, 11:00 p.m.:** At Ashfall's night venue, Rook matches Orin's marked carbon to Della's original impound register, rejects a private cash offer, and gives Nox the corroborated copy in front of both witnesses.
- **October 6, 1997:** The first staged quay safety incident accelerates the berth closure timetable.
- **October 21, 1997:** The coalition confirms the false-vacancy chain and learns the annex index will be pulped before the hearing.
- **November 6–7, 1997:** A king tide coincides with the bond hearing. The evidence is distributed before the final public confrontation.

**World-state facts**

- **`rook-arrived-in-ashfall`:** false — Set only when the Northbar-to-Junction transition reaches the authoritative destination spawn and mission state.
- **`rook-accepted-orin-search`:** false — Records Rook folding the unused eastbound ticket and choosing to help Mack find Orin while escape is still available.
- **`marrow-has-rook-arrival-time`:** false — Records Della taking the Northbar manifest carbon; Marrow can connect the arrival time to Mack's wagon but does not yet know Rook's street identity.
- **`contact-yard-meeting-completed`:** false — Records Rook reaching Nox at the east contact yard after accepting the search for Orin.
- **`orin-status`:** missing — Enumerated narrative state: missing, contacted, safe, public-witness.
- **`mack-trust`:** guarded — Relationship state: guarded, conditional, partner, honest.
- **`nox-trust`:** none — Relationship state: none, provisional, shared-custody.
- **`raze-trust`:** none — Relationship state: none, transactional, coalition, strained, public-allied.
- **`rook-known-to-marrow`:** false — Enables stronger route pressure after Rook keeps the clean copy.
- **`ledger-copy-custody`:** none — Tracks none, rook, nox, or distributed; it is evidence state, not an inventory model reference.
- **`orin-transfer-code-verified`:** false — Records that Orin's marked carbon was matched to Della's original impound register through the authored verification interaction.
- **`della-private-offer-rejected`:** false — Records Rook's fixed refusal of Della's private cash offer; this is a canonical consequence, not a player-choice branch.
- **`pager-code-compromised`:** true — Forces pay-phone and in-person route logic until the leak is identified.
- **`junction-surveillance-checked`:** false — Records the opening loop completion and whether a watcher was observed.
- **`quay-closure-hours`:** 168 — Narrative deadline represented as a persisted integer when a scheduled world-pressure system exists.
- **`dispatch-tape-copied`:** false — Corroborates Marrow dispatch timing without requiring voice-over audio.
- **`false-vacancy-witnessed`:** false — Confirms one listed-vacant property is occupied and maintained.
- **`berth-roster-released`:** false — Irreversible Act II disclosure that splits the Tidehands.
- **`annex-index-copied`:** false — Final corroborating index; not a magical single proof without other facts.
- **`evidence-chain-distributed`:** false — Final irreversible public state set only after independent custodians receive copies.

## First six mission premises

### ash-001-walk-the-block: Walk the Block

- **Narrative purpose:** Turn Rook's consequential arrival into a chosen search for Orin, preserve Marrow's passenger-manifest trail, and send Rook across Ashfall for one meaningful meeting instead of a chain of errands.
- **Character change:** Rook turns a paid pickup into a chosen search while escape remains available; Mack trusts Rook with Nox's yard address, and Rook proves the choice by taking the long road to the meeting.
- **Prerequisites:** None
- **Start:** trigger-volume-enter `trigger.intersection-center` at `mission.intersection-center`

**Objectives**

- **`ash-001-hear-mack-out`:** Speak with Mack about Orin's missed pickup. Mapping: dialogue-completion-event `conversation.mack.introduction` (implemented).
- **`ash-001-meet-yard-contact`:** Take the long road east and meet Nox at the contact yard. Mapping: world-location-entry `location.ash-001.contact-yard` (implemented-WORLD-003-location-and-mission-observation).
- **Highlights:** world `spawn.npc-mechanic`; world-and-map `location.ash-001.contact-yard`
- **Dialogue IDs:** `conversation.mack.introduction`, `conversation.nox.check-in`
- **Cinematic IDs:** `cinematic.ash-001.opening`, `cinematic.ash-001.destination-reveal`
- **Gameplay events:** `dialogue.completed` via dialogue (implemented); `mission.content-requested` via mission (implemented objective-completed request); `world.location-changed` via location-resolver (implemented-through-MissionSystem-location-observation)
- **System dependencies:** `mission-001` implemented: Owns the two objectives, dialogue completion, destination highlight, once-only reveal request, facts, reward, retry, persistence, and disposal.; `core-001` implemented: Boot already selects casual through the existing character-selection authority; the opening must preserve that identity and registry.; `npc-production-roster` roadmap: Mack is production-ready and Nox retains a stable NpcDefinition and local character, but Nox remains outside productionNpcDefinitions until MISSION-003B promotes him for the interactive second-mission setup.; `cinematic-005` implemented: Owns the grounded Northbar performance, atomic cross-level landing, and current public cinematic performance/path/restoration capabilities; cinematic.ash-001.destination-reveal is also implemented as optional presentation.; `world-003-contact-yard` implemented: Owns the physical location.ash-001.contact-yard, collision-supported apron, map reference, mission residency, and unobstructed reveal anchor.
- **Failure:** Player health depletes before the contact-yard meeting completes; The active contact-yard location becomes unavailable before the meeting completes
- **Retry:** Restart at Mack's briefing with no reward or campaign fact changes. A restored save already on the travel objective does not replay the destination reveal or giver conversation.
- **Cancel:** Allowed until Mack's briefing completes. Once Rook accepts the search and the travel objective activates, cancellation is disabled.
- **Skip:** Skipping either cinematic changes presentation only. It never completes Mack's dialogue, enters the contact-yard location, grants facts, or pays the reward.
- **Rewards:** +75 money; equipment: none; facts: rook-arrived-in-ashfall=true, rook-accepted-orin-search=true, marrow-has-rook-arrival-time=true, contact-yard-meeting-completed=true, mack-trust=conditional
- **Persistent facts:** rook-arrived-in-ashfall, rook-accepted-orin-search, marrow-has-rook-arrival-time, contact-yard-meeting-completed, mack-trust
- **Post-mission / hooks:** Unlock Nox's contact-yard check-in and the second mission premise after the long-road meeting completes. Nox has Orin's yard note but no proof that Orin remained there.; Marrow can connect Rook's 5:42 arrival to Mack's wagon but still does not know Rook's street identity.
- **Scene change:** Rook accepts the Orin search, acknowledges Marrow's arrival-time trail, crosses Ashfall for a single purposeful meeting, and changes Mack's trust without falsely resolving Orin's missing status.

### ash-002-carbon-copy: Carbon Copy

- **Narrative purpose:** Turn Orin's clue into a verifiable document chain and introduce Nox's rule that one copy is evidence only when another person can locate its source.
- **Character change:** Nox grants Rook provisional trust after Rook chooses a slower corroboration route over an immediate cash offer.
- **Prerequisites:** `ash-001-walk-the-block`, `contact-yard-meeting-completed`
- **Start:** entity-interaction `nox` at `location.ash-001.contact-yard`

**Objectives**

- **`ash-002-take-nox-copy`:** Take Orin's marked carbon and hear Nox's verification rule. Mapping: conversation-session-complete `conversation.nox.check-in` (existing-conversation-id-rewrite-and-production-placement-required).
- **`ash-002-verify-night-register`:** Cross Ashfall to the night venue, verify Orin's code, and seal Nox's copy. Mapping: mission-owned-interaction `interaction.ash-002.verify-register` (MISSION-003B-implementation-after-WORLD-004).
- **Highlights:** world `nox`; world-and-map `interaction.ash-002.verify-register`
- **Dialogue IDs:** `conversation.nox.check-in`
- **Cinematic IDs:** `cinematic.ash-002-copy-choice`
- **Gameplay events:** `dialogue-completed` via dialogue-to-mission-adapter (implemented-public-mission-event); `interaction-completed` via interaction-to-mission-adapter (implemented-public-mission-event-new-interaction-required); `money.transaction` via economy (implemented-once-only-mission-reward); `mission-content-requested` via mission-to-cinematic-adapter (implemented-completed-phase-request)
- **System dependencies:** `world-004` roadmap: Must author the generic location.ashfall.night-venue interior, public entrance, collision, map/readiness data, authored lighting, mission-safe sector coverage, and stable generic cinematic anchors. It does not own Carbon Copy interactions, story NPC placement, or mission-specific prop choreography.; `npc-002` roadmap: Supplies only unplaced, license-verified AssetCatalog and CharacterDefinition entries with exact clip inventories. It owns no NpcDefinition promotion, story identity, mission logic, or world placement.; `save-001` roadmap: Must persist objective status, the 100-unit once-only reward, all five campaign facts, a corrected no-weapon new-game loadout, and retry/respawn state.; `mission-003b` roadmap: Implements the two-objective MissionDefinition and dialogue, promotes Nox through the existing production NPC authority, selects and regression-validates Della's focal CharacterDefinition, authors Della's test-district venue spawn and temporary cinematic staging, registers the verification interaction and mission-specific level requests, and connects completed-phase presentation without adding a choice UI.; `cinematic-006` definition-only: Implements cinematic.ash-002-copy-choice as optional post-completion presentation with exact-prior restoration and no story authority.
- **Failure:** Rook is depleted before the verification interaction completes; The mission-critical night-venue location, entrance, or verification interaction becomes unavailable; The active level changes before interaction.ash-002.verify-register commits
- **Retry:** Reset the attempt at Nox's contact-yard setup, restore Orin's marked carbon there, clear only ash-002 objective-local state, and never duplicate money or campaign facts. A save restored on objective two resumes the venue journey without replaying Nox's completed setup.
- **Cancel:** Allowed only until ash-002-take-nox-copy completes. Cancellation removes ash-002 highlights and interactions while preserving every ash-001 fact.
- **Skip:** The cinematic is requested only after interaction.ash-002.verify-register has completed the objective and MissionSystem has committed the reward and facts. Confirmed skip restores exact prior gameplay and cannot undo, duplicate, or alter mission state.
- **Rewards:** +100 money; equipment: none; facts: ledger-copy-custody=nox, nox-trust=provisional, rook-known-to-marrow=true, orin-transfer-code-verified=true, della-private-offer-rejected=true
- **Persistent facts:** ledger-copy-custody, nox-trust, rook-known-to-marrow, orin-transfer-code-verified, della-private-offer-rejected
- **Post-mission / hooks:** Unlock the quay introduction and stronger Marrow route pressure once Nox holds the corroborated copy; world props project from committed facts rather than cinematic playback. The copy lists a berth closure before the inspection that supposedly caused it.; Della now knows Rook rejected an easy payout.
- **Scene change:** Changes Nox's trust, Rook's visibility to Marrow, evidence custody, transfer-code verification, and the objective from finding Orin to corroborating his discovery.

### ash-003-night-manifest: Night Manifest

- **Narrative purpose:** Move the story to Cinder Quay and make proof compete with workers' immediate safety and wages.
- **Character change:** Raze shifts from excluding Rook to using Rook as an accountable observer after Rook protects a worker before protecting the document.
- **Prerequisites:** `ash-002-carbon-copy`, `ledger-copy-custody`, `rook-known-to-marrow`, `orin-transfer-code-verified`
- **Start:** entity-interaction `raze` at `cinder-quay`

**Objectives**

- **`ash-003-meet-raze`:** Meet Raze at the quiet deck and establish the worksite rules. Mapping: entity-interaction `raze` (existing-identity-future-location).
- **`ash-003-observe-unload`:** Observe the marked cargo move through the berth without blocking scheduled workers. Mapping: scheduled-system-state `quay-night-unload` (unimplemented-roadmap-dependency).
- **`ash-003-stop-staged-failure`:** Respond to a deliberately loosened load before it injures a worker. Mapping: gameplay-event `quay.load-instability-detected` (unimplemented-roadmap-dependency).
- **`ash-003-copy-manifest`:** Use the surviving manifest number to corroborate the early closure order. Mapping: mission-owned-interaction `quay-manifest-desk` (unimplemented-location-and-interaction).
- **`ash-003-report-to-raze`:** Give Raze the proof and accept his conditions for using it. Mapping: entity-interaction `raze` (production-roster-roadmap).
- **Highlights:** world-and-map `cinder-quay`; world `quay-night-unload`; world `quay-manifest-desk`
- **Dialogue IDs:** `dialogue.ash-003.raze-rules`, `dialogue.ash-003.worker-warning`, `dialogue.ash-003.raze-report`
- **Cinematic IDs:** `cinematic.ash-003-quay-arrival`, `cinematic.ash-003-load-failure`
- **Gameplay events:** `quay.shift-started` via npc-schedule (unimplemented); `quay.load-instability-detected` via worksite-gameplay (unimplemented); `mission.interaction-completed` via mission-and-interaction (roadmap-MISSION-001)
- **System dependencies:** `world-001` roadmap: Needs an authored, streamed Cinder Quay sector with walkable collision, map facts, worksite clearance, and highlights.; `npc-001` roadmap: Needs production workers with verified assets; Raze also needs production placement.; `npc-schedules` roadmap: The timed unload cannot be represented by static fixture NPCs.; `worksite-events` definition-only: A feasible load-instability interaction/event must be designed; no physics spectacle or invented crane system is assumed.; `mission-001` roadmap: Owns objectives, timers, event subscriptions, fail/retry, and persistent facts.
- **Failure:** A worker is injured after the instability warning expires; Rook leaves the active quay sector during the timed unload; Player depletion
- **Retry:** Restart at pre-shift state, reset only the scheduled unload actors and mission interactions, and restore the same timer seed.
- **Cancel:** Allowed before shift-started; after the shift starts, abandonment is a mission failure rather than silent cancellation.
- **Skip:** Arrival and load-failure cinematics may skip presentation only; the worksite event and rescue objective remain authoritative.
- **Rewards:** +125 money; equipment: none; facts: raze-trust=transactional, quay-closure-hours=120
- **Persistent facts:** raze-trust, quay-closure-hours
- **Post-mission / hooks:** Unlock access to Marrow dispatch evidence and establish Raze as a conditional ally. The manifest timestamp predates the inspection by six hours.; A dispatch call sign identifies the tow yard tape that can corroborate the order.
- **Scene change:** Changes Raze's relationship with Rook, reduces the deadline, raises worker risk, and supplies the dispatch objective.

### ash-004-dead-air: Dead Air

- **Narrative purpose:** Use 1997 communications constraints as gameplay: obtain a dispatch cassette and coordinate a route through pay phones while the compromised pager remains unsafe.
- **Character change:** Rook and Nox move from compartmentalized cooperation to shared custody when each must trust the other to hold half the extraction plan.
- **Prerequisites:** `ash-003-night-manifest`, `raze-trust`, `pager-code-compromised`
- **Start:** pay-phone-interaction `glasshouse-payphone-west` at `glasshouse-row`

**Objectives**

- **`ash-004-answer-first-call`:** Reach the pay phone during its scheduled ring window. Mapping: scheduled-interaction-state `glasshouse-payphone-west` (unimplemented).
- **`ash-004-enter-dispatch-yard`:** Enter the Marrow dispatch yard through the route Nox leaves open. Mapping: trigger `marrow-yard-service-entry` (unimplemented-world-location).
- **`ash-004-copy-dispatch-tape`:** Copy the relevant cassette segment without removing the source tape. Mapping: timed-interaction `marrow-dispatch-cassette-deck` (unimplemented-interaction).
- **`ash-004-use-second-phone`:** Confirm extraction at a second pay phone rather than using the compromised pager. Mapping: interaction-and-fact `glasshouse-payphone-south` (unimplemented).
- **`ash-004-deliver-tape-copy`:** Give Nox one copy while Rook retains a separate custody receipt. Mapping: entity-interaction `nox` (production-roster-roadmap).
- **Highlights:** world-and-map `glasshouse-payphone-west`; world-and-map `marrow-yard-service-entry`; world `marrow-dispatch-cassette-deck`; map `glasshouse-payphone-south`
- **Dialogue IDs:** `dialogue.ash-004.first-call`, `dialogue.ash-004.della-yard`, `dialogue.ash-004.second-call`, `dialogue.ash-004.nox-custody`
- **Cinematic IDs:** `cinematic.ash-004-dispatch-confrontation`
- **Gameplay events:** `phone.ringing` via scheduled-world-interaction (unimplemented); `cassette.copy-completed` via mission-interaction (unimplemented); `npc.alert-state-changed` via npc-schedule-or-awareness (unimplemented)
- **System dependencies:** `world-expansion` roadmap: Needs Glasshouse Row, Marrow yard, authored paths, collision, pay-phone and cassette interactions, and map markers.; `scheduled-world-interactions` roadmap: Phone ring windows require deterministic game-time scheduling and retry reset.; `npc-awareness` definition-only: If no awareness system is scheduled, yard pressure must use explicit triggers and route windows rather than invented stealth AI.; `audio-playback` definition-only: The cassette may be represented through subtitles and metadata; character voice-over and paid audio remain locked.; `mission-001` roadmap: Owns timing, events, mission interactions, failure, and evidence facts.
- **Failure:** Miss both scheduled phone windows; Leave the cassette deck before the copy completes; Trigger the explicit yard lockdown state; Player depletion
- **Retry:** Reset phone windows, yard trigger state, and the mission copy; keep the source cassette in place and create no duplicate evidence fact.
- **Cancel:** Allowed before answering the first call. Once the source tape is touched, cancel becomes a failed attempt with yard pressure reset on retry.
- **Skip:** The confrontation cinematic skip restores the exact active mission and alert state; it does not bypass the cassette copy or extraction.
- **Rewards:** +150 money; equipment: none; facts: dispatch-tape-copied=true, nox-trust=shared-custody, pager-code-compromised=false
- **Persistent facts:** dispatch-tape-copied, nox-trust, pager-code-compromised
- **Post-mission / hooks:** Unlock the false-vacancy witness route and remove the compromised-pager restriction from later mission communication. The copied dispatch contains a property address called vacant despite audible residents in the background.; Della offers the 1984 file in exchange for the tape copy.
- **Scene change:** Changes Nox's trust, communication risk, evidence state, and Della's leverage without relying on voiced audio.

### ash-005-occupied: Occupied

- **Narrative purpose:** Make the abstract vacancy fraud personal by proving a listed-empty building houses people and a working print cooperative.
- **Character change:** Mack admits that his 1992 request put Rook on the failed archive route, while Rook chooses to protect witnesses rather than use them as a shortcut to proof.
- **Prerequisites:** `ash-004-dead-air`, `dispatch-tape-copied`, `nox-trust`
- **Start:** entity-interaction `mack` at `spawn.npc-mechanic`

**Objectives**

- **`ash-005-hear-mack-confession`:** Hear Mack's complete account of the 1992 carton route. Mapping: conversation-completion-event `dialogue.ash-005.mack-confession` (new-dialogue-definition-needed).
- **`ash-005-reach-glasshouse`:** Reach the occupied property before the closure crew. Mapping: trigger `glasshouse-occupied-entry` (unimplemented-world-location).
- **`ash-005-document-occupancy`:** Collect three non-exploitative occupancy facts: active utilities, current repair ledger, and resident consent. Mapping: interaction-set `glasshouse-occupancy-evidence` (unimplemented-interactions).
- **`ash-005-prevent-closure`:** Keep the closure notice from taking effect until Raze can witness the records. Mapping: timed-world-state `glasshouse-closure-window` (unimplemented).
- **`ash-005-contact-orin`:** Use Orin's hidden repair notation to establish his first safe contact. Mapping: interaction-and-fact `orin-glasshouse-dead-drop` (unimplemented-entity-and-location).
- **Highlights:** world `spawn.npc-mechanic`; world-and-map `glasshouse-occupied-entry`; world `glasshouse-occupancy-evidence`; world `orin-glasshouse-dead-drop`
- **Dialogue IDs:** `dialogue.ash-005.mack-confession`, `dialogue.ash-005.resident-consent`, `dialogue.ash-005.raze-witness`, `dialogue.ash-005.orin-contact`
- **Cinematic IDs:** `cinematic.ash-005-mack-confession`, `cinematic.ash-005-closure-arrival`
- **Gameplay events:** `occupancy.fact-recorded` via mission-interaction (unimplemented); `closure.window-expired` via scheduled-world-state (unimplemented); `orin.contact-established` via mission (unimplemented)
- **System dependencies:** `world-expansion` roadmap: Needs an authored accessible Glasshouse location and evidence interaction points.; `npc-001` roadmap: Needs production residents/print workers plus Orin's approved model and metadata.; `scheduled-world-state` roadmap: Closure pressure needs deterministic timing and retry behavior.; `mission-001` roadmap: Owns multi-fact objectives, consent-gated interactions, persistence, and failure.; `cinematic-001` roadmap: Mack's confession staging needs subtitle presentation, shots by stable anchors, skip confirmation, and exact restoration.
- **Failure:** Closure window expires without all three occupancy facts; A required witness unloads; Player depletion
- **Retry:** Restore the pre-arrival closure window and interaction facts; resident consent must be requested again but never turned into collectible inventory.
- **Cancel:** Allowed before leaving Mack. After the closure crew arrives, leaving the sector fails the attempt and resets through retry.
- **Skip:** Skipping either cinematic preserves conversation completion rules and cannot grant confession, witness, or occupancy facts.
- **Rewards:** +100 money; equipment: none; facts: false-vacancy-witnessed=true, orin-status=contacted, mack-trust=honest, raze-trust=coalition
- **Persistent facts:** false-vacancy-witnessed, orin-status, mack-trust, raze-trust
- **Post-mission / hooks:** Unlock the reservoir index plan and Orin as a later production witness entity, not a follower AI assumption. Orin supplies the annex shelf code but refuses rescue until the evidence is distributed.; Mack reveals the sealed 1992 cassette Rook carried is still recoverable.
- **Scene change:** Changes Mack's honesty, Orin's status, Raze's alliance, resident risk, and the proof chain from financial inference to witnessed occupancy.

### ash-006-common-custody: Common Custody

- **Narrative purpose:** Complete the first arc by assembling corroborated records and distributing custody before Vera can convert the conflict into one private deal.
- **Character change:** Rook stops treating possession as safety and gives up unilateral control of the evidence; Raze accepts member choice, Nox releases his index, and Mack stops hiding costs from Orin.
- **Prerequisites:** `ash-005-occupied`, `ledger-copy-custody`, `dispatch-tape-copied`, `false-vacancy-witnessed`, `orin-status`
- **Start:** entity-interaction `orin-bell` at `reservoir-steps`

**Objectives**

- **`ash-006-meet-orin`:** Meet Orin on his terms and confirm the annex shelf code. Mapping: entity-interaction `orin-bell` (unimplemented-production-entity).
- **`ash-006-reach-annex`:** Reach the records annex before the scheduled purge and rising water close the lower route. Mapping: trigger-and-world-state `reservoir-annex-entry` (unimplemented-world-location).
- **`ash-006-copy-index`:** Copy the shelf index and match it against existing evidence facts. Mapping: interaction-and-prerequisite-set `reservoir-annex-index` (unimplemented-interaction).
- **`ash-006-release-berth-roster`:** Secure Raze's irreversible consent to release the berth roster. Mapping: entity-interaction-and-fact `raze` (production-roster-roadmap).
- **`ash-006-answer-vera`:** Hear Vera's lawful-looking settlement and reject private custody without turning the scene into combat. Mapping: dialogue-decision `dialogue.ash-006.vera-offer` (linear-alternative-needed-if-no-choice-ui).
- **`ash-006-distribute-chain`:** Deliver independent packets to Nox, Raze, Orin, and a public filing point. Mapping: ordered-entity-and-location-set `evidence-distribution-route` (unimplemented-mission-route).
- **Highlights:** world-and-map `reservoir-steps`; world `reservoir-annex-index`; world `raze`; world-and-map `evidence-distribution-route`
- **Dialogue IDs:** `dialogue.ash-006.orin-terms`, `dialogue.ash-006.raze-consent`, `dialogue.ash-006.vera-offer`, `dialogue.ash-006.common-custody`
- **Cinematic IDs:** `cinematic.ash-006-annex-entry`, `cinematic.ash-006-vera-offer`, `cinematic.ash-006-distribution-finale`
- **Gameplay events:** `annex.purge-started` via scheduled-world-state (unimplemented); `world.water-route-closed` via world-state (unimplemented-no-dynamic-water-assumed); `evidence.packet-delivered` via mission (roadmap-MISSION-001); `story.act-completed` via mission-persistence (unimplemented)
- **System dependencies:** `world-expansion` roadmap: Needs Reservoir Steps, annex access, map route, collision, and performance-reviewed streaming. Route closure may be a trigger/state swap; dynamic flood simulation is not assumed.; `npc-001` roadmap: Needs production Orin and Vera assets plus production promotion/placement for established NPCs.; `mission-001` roadmap: Needs prerequisite fact validation, ordered distribution objectives, cancellation rules, persistence snapshots, and completion.; `cinematic-001` roadmap: Needs subtitle-driven negotiation and finale shots with skip confirmation and exact restoration.; `dialogue-decision-presentation` definition-only: If branching dialogue is absent, Vera's offer resolves as a linear scene followed by a separate explicit distribute interaction.; `scheduled-world-state` roadmap: Purge and route closure need deterministic event timing and restartable state.
- **Failure:** Annex purge completes before the index copy; Rook is depleted; A required delivery target unloads during distribution; The active sector unloads unexpectedly
- **Retry:** Restore the pre-annex snapshot, purge timer, route state, NPC availability, and undelivered packet set; already committed campaign facts remain exactly as the mission snapshot specifies.
- **Cancel:** Not available after annex entry because the purge is the irreversible mission pressure; pause remains separate from cancellation.
- **Skip:** Cinematic skips never choose Vera's offer, grant the index, release the roster, deliver packets, or complete the act.
- **Rewards:** +250 money; equipment: none; facts: annex-index-copied=true, berth-roster-released=true, evidence-chain-distributed=true, orin-status=public-witness, ledger-copy-custody=distributed
- **Persistent facts:** annex-index-copied, berth-roster-released, evidence-chain-distributed, orin-status, ledger-copy-custody
- **Post-mission / hooks:** Complete the Cinder Ledger arc, preserve Ashfall as contested rather than magically fixed, and unlock post-arc world reactions through future persistence work. Marrow drivers begin providing their own records after the distributed release.; Vera faces a public review but retains a credible redevelopment argument for later story conflict.; Rook takes an accountable place at the Junction without becoming its owner.
- **Scene change:** Changes every core relationship, closes the first objective chain, makes evidence public, alters city risk, and sets the irreversible campaign fact evidence-chain-distributed.

## Production boundaries and handoff

**Open creative decisions**

- Choose Rook's pronouns and any player-facing name customization policy before final dialogue lock; this bible avoids gendered references so the existing casual entity remains usable.
- Decide whether Vera remains in office after the final hearing. Her survival is preferred because institutional pressure should not collapse into defeating one villain.
- Choose the exact Atlantic-region voice references only after casting and cultural review; written voice patterns must not be converted into phonetic accents.
- Choose which later world milestone builds Cinder Quay. WORLD-001 expanded the Junction eastward but did not implement the canonical quay, so ash-003 and later premises remain blocked rather than being relocated into implausible Junction space.
- Set final mission reward amounts during economy balancing. Current values are conservative whole-unit story proposals and must use PlayerMoneyAccount rather than a second balance.

**Blocked dependencies**

- MissionSystem provides authoritative objective, highlight, event, content-request, reward, and snapshot behavior; MISSION-003B still must implement the two-objective Carbon Copy definition and its one new interaction without adding a branch.
- CORE-001 selects casual through existing character selection while preserving the registry and debug switching; Northbar must reuse that authority.
- NPC-002 supplies an unplaced, license-verified animated cast through AssetCatalog and CharacterDefinition only. MISSION-003B, not NPC-002, must promote Nox, select Della's focal character, and author story-participant placement through the existing NPC authority.
- WORLD-004 must implement the generic location.ashfall.night-venue interior with a discoverable entrance, collision, map/readiness facts, authored nighttime fixtures, mission-safe sectors, and stable generic anchors. MISSION-003B must add Carbon Copy's interaction, marks/anchor bindings, evidence visuals, and prop paths after that contract lands.
- NPC-001 provides a licensed ambient presentation library, but production identity, performance mappings, scheduling/awareness, and authored placement are still required for Orin, Vera, quay workers, residents, and timed routes. Static fixture behavior is insufficient.
- VEHICLE-001 provides an enter-drive-exit ownership foundation, and Northbar's implemented level-owned wagon path plus atomic landing do not imply cinematic passenger entry/exit, operable doors, seat choreography, or NPC driving; those remain general capability boundaries.
- CINEMATIC-005 provides current performance ownership, composition preflight, level-owned visual paths, adaptive-sector pinning, destination preparation, cross-level landing, skip confirmation, and exact restoration. Carbon Copy must reuse those public contracts rather than depend on pre-CINEMATIC-005 assumptions.
- MAP-001 provides full-world route display for implemented level data; future locations remain unavailable until their own map/readiness facts exist.
- SAVE-001 must persist Carbon Copy objective state, five campaign facts, the once-only 100-unit reward, and safe retry/respawn state; it also owns the corrected new-game loadout with neither knife nor handgun.
- INTERIOR-POP-001 owns ambient night-venue occupants and dance/service population after WORLD-004 and NPC-002. Ambient population is not a blocker for Carbon Copy's three story participants or mission completion.
- Carbon Copy deliberately uses no dialogue choice UI. The authored interaction and mission completion fix Rook's refusal before the cinematic presents it.
- AUDIO-001 provides licensed local theme/radio playback, but character voice-over remains prohibited. Every story clue and performance must work through visible action and subtitles.

**Production assets and systems needed**

- Original-project-owned or CC0/public-domain production NPC models and reviewed portraits for Orin Bell, Vera Sorn, workers, residents, and clerks, with full source/license/hash/scale/axis/animation provenance. NPC-002's unplaced cast may supply Della's focal candidate, but MISSION-003B owns selection and regression approval; pedestrian-street is not a close-up contract.
- MISSION-003B-owned production promotion and placement for established Nox and Della Voss identities, with no duplicate entity, speaker, portrait, or conversation authority. Nox keeps his contact-yard gameplay spawn and is staged temporarily at the venue; Della receives the authored test-district venue mapping.
- WORLD-004's generic Ashfall night venue plus MISSION-003B's mission-specific interaction, blocking marks, anchor bindings, evidence visuals, and prop paths; later streamed world sectors still require their own collision, triggers, landmarks, map/readiness references, and cinematic integration.
- Original environmental props for paper records, carbon sheets, pay phones, cassette decks, manifests, filing shelves, garage details, and quay work areas. Placeholder geometry cannot satisfy production acceptance.
- MISSION-003B integration for the existing MissionSystem: two objectives, dialogue/event mapping, interaction.ash-002.verify-register, world/map highlights, completed-phase cinematic request, deterministic retry/cancel, and debug inspection.
- NPC production roster and performance owner with verified logical-intent mappings, deterministic schedules where needed, and explicit trigger-based pressure. Clapping cannot substitute for conversation, listening, tension, or held acting, and navigation/awareness must not be implied before implementation.
- INTERIOR-POP-001-owned ambient venue cast and genuine dance/service performances remain optional scene dressing for Carbon Copy; ambient actors never replace or own Nox, Della, mission logic, or cinematic facts.
- Cinematic sequence and dialogue presentation using stable IDs, existing game-state/camera ownership, subtitle-safe cue arrays, skip confirmation, exact captured-state cleanup, and destination-aware cross-level restoration.
- Accessibility and localization pass for subtitle length, reading speed, speaker labels, contrast, reduced motion, and non-audio delivery of every required clue.
- No visual or audio asset is acquired or generated by STORY-001. Future accepted assets must be CC0-1.0, public-domain, or original-project-owned with complete provenance.

**Next smallest slices**

- **MISSION-001:** MISSION-001, MISSION-002, and WORLD-003 already provide the authoritative two-objective first mission and physical Contact Yard. MISSION-003B extends that public mission/location contract without reopening the completed WORLD-002 integration.
- **CINEMATIC-001:** CINEMATIC-001 and CINEMATIC-005 already provide skip confirmation, performance ownership, visual paths, destination landing, and exact restoration. CINEMATIC-006 consumes those implemented APIs without reintroducing legacy assumptions.

## Provenance and originality

- The setting, names, factions, characters, plot, mission premises, dialogue intentions, and Cinder Ledger concept are original Vanta City material written for this repository.
- No GTA names, plots, missions, dialogue, brands, UI, music, characters, satire, or recognizable story beats are used.
- Existing runtime asset provenance remains authoritative in the repository asset catalog and adjacent README files. This narrative task adds no runtime asset and makes no new license claim.
- Radio-host writing is outside this bible and must remain separate from character dialogue. No ElevenLabs or paid audio service is called or implied as unlocked.
- Canon facts are separated from open decisions, blocked dependencies, and implementation notes so optional ideas cannot silently become runtime promises.
