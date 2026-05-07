const NEEDS_CONFIG = {
    "haat": {
        "title": { "fi": "Häät", "en": "Weddings" },
        "icon": "💒",
        "description": { 
            "fi": "Suunnittele unelmiesi häät Laukaassa. Löydä tilat, tarjoilut ja elämykset.",
            "en": "Plan your dream wedding in Laukaa. Find venues, catering, and experiences."
        },
        "profilointi_context": "events_and_celebrations",
        "steps": [
            {
                "id": "tarkennus",
                "hide_results": true,
                "question": { "fi": "Millaista hääjuhlaa suunnittelette?", "en": "What kind of wedding are you planning?" },
                "options": [
                    { "label": { "fi": "Perinteiset häät", "en": "Traditional Wedding" }, "sub_context": "perinteiset häät", "tags": ["häät"], "intent_codes": ["EVT_WEDDING"] },
                    { "label": { "fi": "Pienet häät / Intiimi juhla", "en": "Small Wedding / Intimate Celebration" }, "sub_context": "pienet häät", "tags": ["häät"], "intent_codes": ["EVT_WEDDING"] },
                    { "label": { "fi": "Teemahäät / Modernit häät", "en": "Theme Wedding / Modern Wedding" }, "sub_context": "teemahäät", "tags": ["häät"], "intent_codes": ["EVT_WEDDING"] },
                    { "label": { "fi": "Vain vihkiminen ja kahvitus", "en": "Ceremony and Coffee Reception only" }, "sub_context": "vihkiminen", "tags": ["häät"], "intent_codes": ["EVT_WEDDING"] }
                ]
            },
            {
                "id": "kapasiteetti",
                "question": { "fi": "Kuinka paljon henkilöitä tilaisuuteen osallistuu (arvio)?", "en": "How many people will attend the event (estimate)?" },
                "options": [
                    { "label": { "fi": "Alle 20 henkilöä", "en": "Less than 20 people" }, "capacity_req": 20, "tags": [], "intent_codes": ["EVT_WEDDING"] },
                    { "label": { "fi": "Noin 20 - 50 henkilöä", "en": "About 20 - 50 people" }, "capacity_req": 50, "tags": [], "intent_codes": ["EVT_WEDDING"] },
                    { "label": { "fi": "Noin 50 - 100 henkilöä", "en": "About 50 - 100 people" }, "capacity_req": 100, "tags": [], "intent_codes": ["EVT_WEDDING"] },
                    { "label": { "fi": "Yli 100 henkilöä", "en": "Over 100 people" }, "capacity_req": 150, "tags": [], "intent_codes": ["EVT_WEDDING"] }
                ]
            },
            {
                "id": "tila",
                "question": { "fi": "Millaista juhlatilaa etsit?", "en": "What kind of party venue are you looking for?" },
                "options": [
                    { "label": { "fi": "Juhlatila (iso)", "en": "Party venue (large)" }, "tags": ["juhlatila"], "capacity_req": 100, "node_link": "JUHLATILA", "intent_codes": ["VENUE_PARTY"] },
                    { "label": { "fi": "Tunnelmallinen kartano", "en": "Atmospheric manor" }, "tags": ["kartano", "juhlatila"], "capacity_req": 50, "node_link": "JUHLATILA", "intent_codes": ["VENUE_PARTY"] },
                    { "label": { "fi": "Luonnonläheinen tila", "en": "Nature-oriented space" }, "tags": ["luonto", "juhlatila"], "capacity_req": 30, "node_link": "JUHLATILA", "intent_codes": ["VENUE_PARTY"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "ranta" } },
                    { "label": { "fi": "Tila omilla tarjoiluilla", "en": "Venue with own catering allowed" }, "tags": ["juhlatila"], "capacity_req": 20, "node_link": "JUHLATILA", "intent_codes": ["VENUE_PARTY"], "profilointi_filter": { "section": "events_and_celebrations", "field": "own_catering_allowed", "value": true } }
                ]
            },
            {
                "id": "palvelut",
                "multiple": true,
                "question": { "fi": "Mitä palveluita tarvitset juhlapäivään?", "en": "What services do you need for the wedding day?" },
                "options": [
                    { "label": { "fi": "Pitopalvelu", "en": "Catering service" }, "tags": ["pitopalvelu"], "intent_codes": ["BIZ_CATERING"] },
                    { "label": { "fi": "Valokuvaaja", "en": "Photographer" }, "tags": ["valokuvaus", "valokuvaaja"], "intent_codes": ["MEDIA_PHOTO"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "hääkuvaus" } },
                    { "label": { "fi": "Videokuvaaja", "en": "Videographer" }, "tags": ["videotuotanto", "videokuvaus", "videokuvaaja"], "intent_codes": ["MEDIA_VIDEO"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "häävideo" } },
                    { "label": { "fi": "Kukkakauppa & Koristelu", "en": "Flower shop & Decoration" }, "tags": ["kukkakauppa", "kukat"], "intent_codes": ["BIZ_FLORIST"] },
                    { "label": { "fi": "Musiikki tai DJ", "en": "Music or DJ" }, "tags": ["musiikki", "ohjelmapalvelut"], "intent_codes": ["ENT_MUSIC"], "profilointi_filter": { "section": "events_and_celebrations", "field": "entertainment_features", "value": "live-musiikki" } }
                ]
            },
            {
                "id": "vieraat",
                "multiple": true,
                "question": { "fi": "Tarpeet vieraiden mukavuuteen?", "en": "Needs for guest comfort?" },
                "skipIf": "getSelectedCompanyProfilointi('tila', 'events_and_celebrations', 'accommodation_available')",
                "skipMessage": { "fi": "Valitsemassasi tilassa majoitus sisältyy pakettiin — ei tarvetta erikseen.", "en": "Accommodation is included in the package at your selected venue — no separate need." },
                "options": [
                    { "label": { "fi": "Majoitus vieraille", "en": "Accommodation for guests" }, "tags": ["majoitus"], "intent_codes": ["VENUE_ACCOMMODATION"] },
                    { "label": { "fi": "Kuljetus / Bussi / Taksi", "en": "Transport / Bus / Taxi" }, "tags": ["taksi", "kuljetus"], "intent_codes": ["BIZ_TRANSPORT"] },
                    { "label": { "fi": "Kauneuspalvelut / Meikki", "en": "Beauty services / Makeup" }, "tags": ["kauneus", "kampaamo"], "intent_codes": ["WELLBEING_BEAUTY"] }
                ]
            },
            {
                "id": "tallennus_ja_muistot",
                "multiple": true,
                "question": { "fi": "Haluaisitko ikuistaa päivän digitaalisesti tai tarvitsetko muita digitointipalveluita?", "en": "Would you like to capture the day digitally or do you need other digitization services?" },
                "options": [
                    { "label": { "fi": "Häävideon editointi / Koostepalvelu", "en": "Wedding video editing / Compilation service" }, "tags": ["videotuotanto", "häävideon editointi"], "node_link": "DIGITOINTI", "intent_codes": ["MEDIA_VIDEO"], "profilointi_filter": { "section": "events_and_celebrations", "field": "digitization_features", "value": "häävideo editointi" } },
                    { "label": { "fi": "Drone-kuvaus", "en": "Drone filming" }, "tags": ["drone", "drone-kuvaus"], "node_link": "DIGITOINTI", "intent_codes": ["MEDIA_DRONE"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "drone-kuvaus" } },
                    { "label": { "fi": "Digitointipalvelut (kuvat, videot ym.)", "en": "Digitization services (photos, videos etc.)" }, "tags": ["digitointi"], "node_link": "DIGITOINTI", "intent_codes": ["MEDIA_DIGITIZATION"] }
                ]
            }
        ]
    },
    "yritysjuhlat": {
        "title": { "fi": "Yritysjuhlat", "en": "Corporate Parties" },
        "icon": "🥂",
        "description": { "fi": "Järjestä onnistuneet henkilöstöjuhlat, pikkujoulut tai asiakastilaisuudet.", "en": "Organize successful staff parties, Christmas parties or client events." },
        "profilointi_context": "events_and_celebrations",
        "steps": [
            {
                "id": "tarkennus",
                "question": { "fi": "Millaista tilaisuutta olet järjestämässä?", "en": "What kind of event are you organizing?" },
                "options": [
                    { "label": { "fi": "Pikkujoulut", "en": "Christmas Party" }, "sub_context": "pikkujoulut", "tags": ["juhlatila"], "capacity_req": 30 },
                    { "label": { "fi": "Henkilöstöjuhlat / Kesäjuhlat", "en": "Staff Party / Summer Party" }, "sub_context": "henkilöstöjuhlat", "tags": ["juhlatila"], "capacity_req": 50 },
                    { "label": { "fi": "Virkistyspäivä / Tyky-päivä", "en": "Team Day / Wellness Day" }, "sub_context": "tyky-paiva", "tags": ["ohjelmapalvelut"] }
                ]
            },
            {
                "id": "kapasiteetti",
                "question": { "fi": "Kuinka paljon henkilöitä tilaisuuteen osallistuu (arvio)?", "en": "How many people will attend (estimate)?" },
                "options": [
                    { "label": { "fi": "Alle 20 henkilöä", "en": "Less than 20 people" }, "capacity_req": 20, "tags": [] },
                    { "label": { "fi": "Noin 20 - 50 henkilöä", "en": "About 20 - 50 people" }, "capacity_req": 50, "tags": [] },
                    { "label": { "fi": "Noin 50 - 100 henkilöä", "en": "About 50 - 100 people" }, "capacity_req": 100, "tags": [] },
                    { "label": { "fi": "Yli 100 henkilöä", "en": "Over 100 people" }, "capacity_req": 150, "tags": [] }
                ]
            },
            {
                "id": "palvelut",
                "multiple": true,
                "question": { "fi": "Mitä lisäpalveluita tarvitsette?", "en": "What additional services do you need?" },
                "options": [
                    { "label": { "fi": "Pitopalvelu", "en": "Catering" }, "tags": ["pitopalvelu"] },
                    { "label": { "fi": "Majoitus", "en": "Accommodation" }, "tags": ["majoitus"] },
                    { "label": { "fi": "Kuljetukset", "en": "Transport" }, "tags": ["kuljetus", "taksi"] },
                    { "label": { "fi": "Videokuvaus", "en": "Video recording" }, "tags": ["videotuotanto", "videokuvaus"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "videotuotanto" } },
                    { "label": { "fi": "Valokuvaus", "en": "Photography" }, "tags": ["valokuvaus", "valokuvaaja"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "juhlakuvaus" } },
                    { "label": { "fi": "Saunatilat", "en": "Sauna facilities" }, "tags": ["saunatilat"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "sauna" } },
                    { "label": { "fi": "Ohjelmapalvelut / Elämykset", "en": "Entertainment / Experiences" }, "tags": ["ohjelmapalvelut"] },
                    { "label": { "fi": "AV-tekniikka & Äänentoisto", "en": "AV tech & Sound" }, "tags": ["it-palvelut"], "profilointi_filter": { "section": "events_and_celebrations", "field": "has_av_tech", "value": true } }
                ]
            },
            {
                "id": "hyvinvointi",
                "multiple": true,
                "question": { "fi": "Tarvitsetteko hyvinvointia tai ohjelmaa tyky-päivään?", "en": "Do you need wellbeing activities or a program for the team day?" },
                "options": [
                    { "label": { "fi": "Yrityshyvinvointi / Luennot", "en": "Corporate wellbeing / Lectures" }, "tags": ["hyvinvointi"] },
                    { "label": { "fi": "Ohjattu liikunta / Jooga", "en": "Guided exercise / Yoga" }, "tags": ["liikunta"] },
                    { "label": { "fi": "Luontoelämykset / Eräopas", "en": "Nature experiences / Wilderness guide" }, "tags": ["ohjelmapalvelut"] }
                ]
            }
        ]
    },
    "yritystilaisuudet": {
        "title": { "fi": "Yritystilaisuudet", "en": "Business Events" },
        "icon": "💼",
        "description": { "fi": "Kokoukset, seminaarit ja koulutukset ammattimaisessa ympäristössä.", "en": "Meetings, seminars and training sessions in a professional environment." },
        "profilointi_context": "business_events",
        "steps": [
            {
                "id": "tarkennus",
                "question": { "fi": "Millaista tilaa tarvitsette?", "en": "What kind of space do you need?" },
                "options": [
                    { "label": { "fi": "Pieni kokous / Neuvottelu", "en": "Small meeting / Negotiation" }, "sub_context": "kokous", "tags": ["kokoustilat"], "capacity_req": 5 },
                    { "label": { "fi": "Seminaari / Koulutus", "en": "Seminar / Training" }, "sub_context": "seminaari", "tags": ["seminaaritilat"], "capacity_req": 1 },
                    { "label": { "fi": "Konferenssi / Suuri tilaisuus", "en": "Conference / Large event" }, "sub_context": "konferenssi", "tags": ["kokoustilat"], "capacity_req": 1 }
                ]
            },
            {
                "id": "kapasiteetti",
                "question": { "fi": "Kuinka paljon henkilöitä tilaisuuteen osallistuu (arvio)?", "en": "How many people will attend (estimate)?" },
                "options": [
                    { "label": { "fi": "Alle 20 henkilöä", "en": "Less than 20 people" }, "capacity_req": 20, "tags": [] },
                    { "label": { "fi": "Noin 20 - 50 henkilöä", "en": "About 20 - 50 people" }, "capacity_req": 50, "tags": [] },
                    { "label": { "fi": "Noin 50 - 100 henkilöä", "en": "About 50 - 100 people" }, "capacity_req": 100, "tags": [] },
                    { "label": { "fi": "Yli 100 henkilöä", "en": "Over 100 people" }, "capacity_req": 150, "tags": [] }
                ]
            },
            {
                "id": "tarjoilu",
                "question": { "fi": "Tarjoilut tilaisuuteen?", "en": "Catering for the event?" },
                "options": [
                    { "label": { "fi": "Lounas ja kahvitus", "en": "Lunch and coffee" }, "tags": ["ravintola", "pitopalvelu"] },
                    { "label": { "fi": "Iltapala", "en": "Evening snack" }, "tags": ["ravintola"] },
                    { "label": { "fi": "Vain tilat", "en": "Venue only" }, "tags": [] }
                ]
            },
            {
                "id": "lisat",
                "multiple": true,
                "question": { "fi": "Muut tarpeet?", "en": "Other needs?" },
                "options": [
                    { "label": { "fi": "Majoitus", "en": "Accommodation" }, "tags": ["majoitus"] },
                    { "label": { "fi": "Videokuvaus", "en": "Video recording" }, "tags": ["videotuotanto", "videokuvaus", "videokuvaaja"], "profilointi_filter": { "section": "business_events", "field": "refinement_tags", "value": "yritysvideo" } },
                    { "label": { "fi": "Valokuvaus", "en": "Photography" }, "tags": ["valokuvaus", "valokuvaaja"], "profilointi_filter": { "section": "business_events", "field": "refinement_tags", "value": "yrityskuvaus" } },
                    { "label": { "fi": "IT-tuki / AV-tekniikka", "en": "IT support / AV tech" }, "tags": ["it-palvelut"], "profilointi_filter": { "section": "business_events", "field": "has_projector", "value": true } }
                ]
            }
        ]
    },
    "syntymapaivat": {
        "title": { "fi": "Syntymäpäivät", "en": "Birthdays" },
        "icon": "🎂",
        "description": { "fi": "Järjestä ikimuistoiset syntymäpäivät kaikenikäisille.", "en": "Organize unforgettable birthdays for all ages." },
        "profilointi_context": "events_and_celebrations",
        "steps": [
            {
                "id": "tarkennus",
                "question": { "fi": "Kenen juhlia järjestetään?", "en": "Who is the celebration for?" },
                "options": [
                    { "label": { "fi": "Lasten syntymäpäivät", "en": "Children's birthday" }, "sub_context": "lasten synttärit", "tags": ["lapset"] },
                    { "label": { "fi": "Nuorten / Aikuisten juhlat", "en": "Teen / Adult party" }, "sub_context": "aikuisten synttärit", "require_fits_for": { "key": "events-and-celebrations", "min": 60 }, "capacity_req": 1 },
                    { "label": { "fi": "Pyöreät vuodet / Sukujuhlat", "en": "Milestone birthday / Family celebration" }, "sub_context": "sukujuhlat", "require_fits_for": { "key": "events-and-celebrations", "min": 60 }, "capacity_req": 1 }
                ]
            },
            {
                "id": "kapasiteetti",
                "question": { "fi": "Kuinka paljon henkilöitä tilaisuuteen osallistuu (arvio)?", "en": "How many people will attend (estimate)?" },
                "options": [
                    { "label": { "fi": "Alle 20 henkilöä", "en": "Less than 20 people" }, "capacity_req": 20, "tags": [] },
                    { "label": { "fi": "Noin 20 - 50 henkilöä", "en": "About 20 - 50 people" }, "capacity_req": 50, "tags": [] },
                    { "label": { "fi": "Noin 50 - 100 henkilöä", "en": "About 50 - 100 people" }, "capacity_req": 100, "tags": [] },
                    { "label": { "fi": "Yli 100 henkilöä", "en": "Over 100 people" }, "capacity_req": 150, "tags": [] }
                ]
            },
            {
                "id": "tila",
                "question": { "fi": "Missä haluat juhlia?", "en": "Where do you want to celebrate?" },
                "options": [
                    { "label": { "fi": "Juhlatila ruokailulla", "en": "Venue with dining" }, "tags": ["ravintola"], "capacity_req": 10 },
                    { "label": { "fi": "Kotona (tarvitaan palveluita)", "en": "At home (services needed)" }, "tags": ["pitopalvelu", "siivous", "kukkakauppa"] },
                    { "label": { "fi": "Saunalla tai mökillä", "en": "Sauna or cottage" }, "tags": ["saunatilat", "majoitus"], "capacity_req": 10 }
                ]
            },
            {
                "id": "palvelut",
                "multiple": true,
                "question": { "fi": "Mitä tarvitaan onnistuneisiin juhliin?", "en": "What do you need for a successful party?" },
                "options": [
                    { "label": { "fi": "Pitopalvelu / Ruoat", "en": "Catering / Food" }, "tags": ["pitopalvelu"] },
                    { "label": { "fi": "Kakut / Leivonnaiset", "en": "Cakes / Pastries" }, "tags": ["leipomo", "elintarvike"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "hääkakku" } },
                    { "label": { "fi": "Ohjelma / Esiintyjä", "en": "Entertainment / Performer" }, "tags": ["ohjelmapalvelut"] },
                    { "label": { "fi": "Valokuvaus", "en": "Photography" }, "tags": ["valokuvaus"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "juhlakuvaus" } },
                    { "label": { "fi": "Videokuvaus", "en": "Video recording" }, "tags": ["videotuotanto", "videokuvaus"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "juhlakuvaus" } },
                    { "label": { "fi": "Kukat", "en": "Flowers" }, "tags": ["kukkakauppa", "kukat"] }
                ]
            }
        ]
    },
    "muutto": {
        "title": { "fi": "Muutto", "en": "Moving" },
        "icon": "📦",
        "description": { "fi": "Muuttoauto, kantajat, pakkaus ja loppusiivous helposti.", "en": "Moving van, carriers, packing and final cleaning made easy." },
        "profilointi_context": "moving_and_housing",
        "steps": [
            {
                "id": "muuttoapu",
                "question": { "fi": "Millaista apua tarvitset muuttoon?", "en": "What kind of help do you need for moving?" },
                "options": [
                    { "label": { "fi": "Muuttopalvelu (auto + kantajat)", "en": "Moving service (van + carriers)" }, "tags": ["kuljetusliike", "muuttopalvelu"] },
                    { "label": { "fi": "Vain kuljetus / Peräkärry", "en": "Transport only / Trailer" }, "tags": ["kuljetus", "hinaus"] },
                    { "label": { "fi": "Varastointipalvelu", "en": "Storage service" }, "tags": ["varastointi"] }
                ]
            },
            {
                "id": "asunto",
                "multiple": true,
                "question": { "fi": "Uuden kodin valmistelu?", "en": "Preparing your new home?" },
                "options": [
                    { "label": { "fi": "Muuttosiivous", "en": "Moving clean" }, "tags": ["siivous", "puhdistuspalvelut"] },
                    { "label": { "fi": "Sähkösopimus / Sähköasennukset", "en": "Electricity contract / Electrical installations" }, "tags": ["sähköasennukset"] },
                    { "label": { "fi": "Pieni pintaremontti", "en": "Minor surface renovation" }, "tags": ["maalaustyöt", "rakentaminen"] }
                ]
            }
        ]
    },
    "remontti": {
        "title": { "fi": "Remontti", "en": "Renovation" },
        "icon": "🔨",
        "description": { "fi": "Löydä tekijät ja tarvikkeet kodin tai toimitilan uudistukseen.", "en": "Find professionals and materials for your home or office renovation." },
        "profilointi_context": "construction_and_maintenance",
        "steps": [
            {
                "id": "tarkennus",
                "question": { "fi": "Mitä olet remontoimassa?", "en": "What are you renovating?" },
                "options": [
                    { "label": { "fi": "Kylpyhuoneremontti", "en": "Bathroom renovation" }, "sub_context": "kylpyhuoneremontti", "tags": ["LVI", "rakentaminen"] },
                    { "label": { "fi": "Keittiöremontti", "en": "Kitchen renovation" }, "sub_context": "keittiöremontti", "tags": ["rakentaminen"] },
                    { "label": { "fi": "Pintaremontti (maalaus tms.)", "en": "Surface renovation (painting etc.)" }, "sub_context": "pintaremontti", "tags": ["maalaustyöt"] },
                    { "label": { "fi": "Uudisrakentaminen", "en": "New construction" }, "sub_context": "uudisrakentaminen", "tags": ["rakentaminen"] }
                ]
            },
            {
                "id": "tekijat",
                "multiple": true,
                "question": { "fi": "Millaista ammattilaista etsit?", "en": "What kind of professional are you looking for?" },
                "options": [
                    { "label": { "fi": "Rakennus- / Remonttimies", "en": "Builder / Handyman" }, "tags": ["rakentaminen", "rakennustyöt"] },
                    { "label": { "fi": "Sähköasentaja", "en": "Electrician" }, "tags": ["sähköasennukset"] },
                    { "label": { "fi": "LVI-asentaja (Putkimies)", "en": "HVAC installer (Plumber)" }, "tags": ["LVI"] },
                    { "label": { "fi": "Maalari / Tapetoija", "en": "Painter / Wallpaper installer" }, "tags": ["maalaustyöt"] },
                    { "label": { "fi": "Puuseppä / Kalustekorjaus", "en": "Carpenter / Furniture repair" }, "tags": ["puutyöt", "kalusteet", "puuseppä"], "profilointi_filter": { "section": "construction_and_maintenance", "field": "refinement_tags", "value": "kalustekorjaus" } },
                    { "label": { "fi": "Suunnittelija / Arkkitehti", "en": "Designer / Architect" }, "tags": ["suunnittelutoimisto"] }
                ]
            },
            {
                "id": "tarvikkeet",
                "question": { "fi": "Mistä hankit materiaalit?", "en": "Where do you get materials?" },
                "options": [
                    { "label": { "fi": "Rautakauppa / Rakennustarvikkeet", "en": "Hardware store / Building supplies" }, "tags": ["rautakauppa", "rakennustarvikkeet"] },
                    { "label": { "fi": "Koneiden ja laitteiden vuokraus", "en": "Machine and equipment rental" }, "tags": ["rakennuskonevuokraus"] },
                    { "label": { "fi": "Sisustustuotteet", "en": "Interior decoration products" }, "tags": ["kaupat ja ostokset", "erikoisliikkeet"] }
                ]
            }
        ]
    },
    "mokkipalvelut": {
        "title": { "fi": "Mökkipalvelut", "en": "Cottage Services" },
        "icon": "🏡",
        "description": { "fi": "Kaikki vapaa-ajan asunnon huoltoon ja nauttimiseen.", "en": "Everything for your holiday home maintenance and enjoyment." },
        "profilointi_context": "cottage_services",
        "steps": [
            {
                "id": "tarkennus",
                "question": { "fi": "Millaista mökkipalvelua etsit?", "en": "What kind of cottage service are you looking for?" },
                "options": [
                    { "label": { "fi": "Talvivalvonta & Huolenpito", "en": "Winter surveillance & Care" }, "sub_context": "talvivalvonta", "tags": ["kiinteistöhuolto"], "is_service": true },
                    { "label": { "fi": "Kevätkunnostus / Siivous", "en": "Spring maintenance / Cleaning" }, "sub_context": "kevatkunnostus", "tags": ["siivous"] },
                    { "label": { "fi": "Polttopuut & Peruspalvelut", "en": "Firewood & Basic services" }, "sub_context": "polttopuut", "tags": ["polttopuut"] },
                    { "label": { "fi": "Remontointi & Laiturit", "en": "Renovation & Docks" }, "sub_context": "mokkiremontti", "tags": ["rakentaminen"] }
                ]
            },
            {
                "id": "perushuolto",
                "multiple": true,
                "question": { "fi": "Mitä huoltoa mökki kaipaa?", "en": "What maintenance does the cottage need?" },
                "options": [
                    { "label": { "fi": "Kiinteistöhuolto / Talonmies", "en": "Property maintenance / Caretaker" }, "tags": ["kiinteistöhuolto"], "profilointi_filter": { "section": "cottage_services", "field": "key_holding", "value": true } },
                    { "label": { "fi": "Nuohous", "en": "Chimney sweeping" }, "tags": ["nuohouspalvelut"], "is_service": true },
                    { "label": { "fi": "Polttopuut", "en": "Firewood" }, "tags": ["polttopuut"] },
                    { "label": { "fi": "Laituritarvikkeet / Huolto", "en": "Dock supplies / Maintenance" }, "tags": ["rakentaminen"], "profilointi_filter": { "section": "cottage_services", "field": "dock_maintenance", "value": true } }
                ]
            },
            {
                "id": "piha-ja-tekniikka",
                "multiple": true,
                "question": { "fi": "Pihan ja tekniikan tarpeet?", "en": "Yard and technical needs?" },
                "options": [
                    { "label": { "fi": "Pihanhoito / Viherrakentaminen", "en": "Yard care / Landscaping" }, "tags": ["viherrakentaminen", "pihasuunnittelu"] },
                    { "label": { "fi": "Pienkonehuolto (ruohonleikkurit ym.)", "en": "Small machine maintenance (lawn mowers etc.)" }, "tags": ["pienkonehuolto"] },
                    { "label": { "fi": "Taksi / Kuljetus", "en": "Taxi / Transport" }, "tags": ["taksi", "kuljetus"] }
                ]
            }
        ]
    },
    "kiinteistopalvelut": {
        "title": { "fi": "Taloyhtiö & Kiinteistöpalvelut", "en": "Housing Company & Property Services" },
        "icon": "🏘️",
        "description": { "fi": "Huolenpitoa ja arvoa kiinteistöllesi sekä taloyhtiön tarpeet.", "en": "Care and value for your property and housing company needs." },
        "profilointi_context": "housing_company_and_contracts",
        "steps": [
            {
                "id": "tarkennus",
                "question": { "fi": "Millaista palvelua tarvitset?", "en": "What kind of service do you need?" },
                "options": [
                    { "label": { "fi": "Jatkuva kiinteistöhuolto", "en": "Ongoing property maintenance" }, "sub_context": "kiinteistöhuolto", "tags": ["kiinteistöhuolto"] },
                    { "label": { "fi": "Isännöintipalvelut", "en": "Property management services" }, "sub_context": "isännöinti", "tags": ["isännöinti"] },
                    { "label": { "fi": "Kertaluonteinen remontti", "en": "One-time renovation" }, "sub_context": "linjasaneeraus", "tags": ["rakentaminen"] },
                    { "label": { "fi": "Siivouspalvelut", "en": "Cleaning services" }, "tags": ["siivous"], "is_service": true },
                    { "label": { "fi": "Pihanhoito / Lumityöt", "en": "Yard care / Snow removal" }, "tags": ["viherrakentaminen", "kiinteistöhuolto"], "is_service": true }
                ]
            },
            {
                "id": "hallinto",
                "question": { "fi": "Hallinnolliset ja asiantuntijatarpeet?", "en": "Administrative and expert needs?" },
                "options": [
                    { "label": { "fi": "Isännöintipalvelut", "en": "Property management services" }, "tags": ["isännöinti"] },
                    { "label": { "fi": "Tilitoimisto / Tilintarkastus", "en": "Accounting / Auditing" }, "tags": ["tilitoimisto"] },
                    { "label": { "fi": "Lakipalvelut ja sopimusasiat", "en": "Legal services and contracts" }, "tags": ["lakiasiaintoimistot", "sopimukset"] }
                ]
            }
        ]
    },
    "hautajaiset": {
        "title": { "fi": "Hautajaiset", "en": "Funerals" },
        "icon": "🕯️",
        "description": { "fi": "Arvokkaat ja huolelliset hautajaisjärjestelyt.", "en": "Dignified and careful funeral arrangements." },
        "profilointi_context": "funerals_and_memorials",
        "steps": [
            {
                "id": "paatarve",
                "multiple": true,
                "question": { "fi": "Mitä asioita haluatte edistää?", "en": "What matters would you like to address?" },
                "options": [
                    { "label": { "fi": "Hautajaisjärjestelyt", "en": "Funeral arrangements" }, "sub_context": "hautauspalvelu", "tags": ["hautauspalvelu"], "node_link": "HAUTAUS" },
                    { "label": { "fi": "Muistotilaisuus", "en": "Memorial service" }, "sub_context": "muistotilaisuus", "tags": ["muistotilaisuus", "muistotilaisuudet"], "capacity_req": 10, "node_link": "HAUTAUS" },
                    { "label": { "fi": "Perunkirjoitus ja laki-asiat", "en": "Estate inventory and legal matters" }, "sub_context": "perunkirjoitus", "tags": ["lakiasiaintoimistot", "perunkirjoitus"] }
                ]
            },
            {
                "id": "peruspalvelu",
                "hide_results": true,
                "question": { "fi": "Hautauspalvelut?", "en": "Funeral services?" },
                "skipIf": "!isSelected('paatarve', 'Hautajaisjärjestelyt')",
                "options": [
                    { "label": { "fi": "Hautauspalvelu ja arkut", "en": "Funeral service and coffins" }, "tags": ["hautauspalvelu"] },
                    { "label": { "fi": "Hautakivet ja kaiverrukset", "en": "Gravestones and engravings" }, "tags": ["hautauspalvelu"] }
                ]
            },
            {
                "id": "kapasiteetti",
                "question": { "fi": "Kuinka paljon henkilöitä muistotilaisuuteen osallistuu?", "en": "How many people will attend the memorial service?" },
                "skipIf": "!isSelected('paatarve', 'Muistotilaisuus')",
                "options": [
                    { "label": { "fi": "Alle 20 henkilöä", "en": "Less than 20 people" }, "capacity_req": 20, "tags": [] },
                    { "label": { "fi": "Noin 20 - 50 henkilöä", "en": "About 20 - 50 people" }, "capacity_req": 50, "tags": [] },
                    { "label": { "fi": "Noin 50 - 100 henkilöä", "en": "About 50 - 100 people" }, "capacity_req": 100, "tags": [] },
                    { "label": { "fi": "Yli 100 henkilöä", "en": "Over 100 people" }, "capacity_req": 150, "tags": [] }
                ]
            },
            {
                "id": "muistotila",
                "hide_results": true,
                "question": { "fi": "Muistotilaisuuden tila?", "en": "Venue for the memorial service?" },
                "skipIf": "!isSelected('paatarve', 'Muistotilaisuus')",
                "options": [
                    { "label": { "fi": "Rauhallinen muistotila", "en": "Quiet private space" }, "tags": ["juhlatila"], "capacity_req": 20, "profilointi_filter": { "section": "funerals_and_memorials", "field": "quiet_private_space", "value": true }, "require_fits_for": { "key": "funerals_and_memorials", "min": 30 } },
                    { "label": { "fi": "Seurakuntasali", "en": "Parish hall" }, "tags": ["seurakunta"] },
                    { "label": { "fi": "Tarvitsen vain catering-palvelun", "en": "Catering service only" }, "tags": [], "profilointi_filter": { "section": "funerals_and_memorials", "field": "memorial_catering", "value": true }, "require_fits_for": { "key": "funerals_and_memorials", "min": 20 } }
                ]
            },
            {
                "id": "muistotilaisuus_lisapalvelut",
                "multiple": true,
                "hide_results": true,
                "question": { "fi": "Muistotilaisuuden lisäpalvelut?", "en": "Additional services for the memorial?" },
                "skipIf": "!isSelected('paatarve', 'Muistotilaisuus')",
                "options": [
                    { "label": { "fi": "Kahvitus / Pitopalvelu", "en": "Coffee / Catering" }, "tags": ["pitopalvelu"], "profilointi_filter": { "section": "funerals_and_memorials", "field": "memorial_catering", "value": true }, "require_fits_for": { "key": "funerals_and_memorials", "min": 20 } },
                    { "label": { "fi": "Kukkatervehdykset", "en": "Floral tributes" }, "tags": ["kukkakauppa", "kukat"], "profilointi_filter": { "section": "funerals_and_memorials", "field": "funeral_flowers", "value": true } },
                    { "label": { "fi": "Kuljetuspalvelut", "en": "Transport services" }, "tags": ["hautauspalvelu", "kuljetus"], "profilointi_filter": { "section": "funerals_and_memorials", "field": "transport_assistance", "value": true } }
                ]
            },
            {
                "id": "laki_asiat_tarkennus",
                "multiple": true,
                "hide_results": true,
                "question": { "fi": "Lakipalvelut ja asiakirjat?", "en": "Legal services and documents?" },
                "skipIf": "!isSelected('paatarve', 'Laki-asiat')",
                "options": [
                    { "label": { "fi": "Perunkirjoitus", "en": "Estate inventory" }, "tags": ["lakiasiaintoimistot"] },
                    { "label": { "fi": "Testamentti ja edunvalvonta", "en": "Will and guardianship" }, "tags": ["lakiasiaintoimistot"] },
                    { "label": { "fi": "Lakiasiain neuvonta", "en": "Legal advice" }, "tags": ["lakiasiaintoimistot"] }
                ]
            },
            {
                "id": "muistot_ja_tallennus",
                "multiple": true,
                "skipIf": "!isSelected('paatarve', 'Muistotilaisuus')",
                "question": { "fi": "Haluaisitko tallentaa muistot tai tarvitsetko digitointipalveluita?", "en": "Would you like to preserve memories or need digitization services?" },
                "options": [
                    { "label": { "fi": "Videokuvaus / Esitykset", "en": "Video recording / Presentations" }, "tags": ["videotuotanto", "videokuvaus", "videokuvaaja"], "profilointi_filter": { "section": "funerals_and_memorials", "field": "refinement_tags", "value": "muistotilaisuuskuvaus" } },
                    { "label": { "fi": "Valokuvaus", "en": "Photography" }, "tags": ["valokuvaus", "hautajaiskuvaus"], "profilointi_filter": { "section": "funerals_and_memorials", "field": "refinement_tags", "value": "hautajaiskuvaus" } },
                    { "label": { "fi": "Digitointipalvelut (kuvat, videot ym.)", "en": "Digitization services (photos, videos etc.)" }, "tags": ["digitointi"], "node_link": "DIGITOINTI" }
                ]
            }
        ]
    },
    "yrityksen-perustaminen": {
        "title": { "fi": "Yrityksen perustaminen", "en": "Starting a Business" },
        "icon": "🚀",
        "description": { "fi": "Kaikki tarvittava uuden yrityksen starttiin.", "en": "Everything you need to launch a new business." },
        "profilointi_context": "startup_services",
        "steps": [
            {
                "id": "tarkennus",
                "question": { "fi": "Missä vaiheessa yrityksen perustaminen on?", "en": "What stage is your business startup at?" },
                "options": [
                    { "label": { "fi": "Liikeidea & Suunnittelu", "en": "Business idea & Planning" }, "sub_context": "liikeidea", "tags": ["konsultointi"] },
                    { "label": { "fi": "Rekisteröinti & Hallinto", "en": "Registration & Administration" }, "sub_context": "rekisterointi", "tags": ["tilitoimisto"] },
                    { "label": { "fi": "Markkinointi & Verkkosivut", "en": "Marketing & Website" }, "sub_context": "digimarkkinointi", "tags": ["it-palvelut"] }
                ]
            },
            {
                "id": "hallinto",
                "multiple": true,
                "question": { "fi": "Alkuvaiheen hallinto?", "en": "Early-stage administration?" },
                "options": [
                    { "label": { "fi": "Yritysneuvonta / Liiketoimintasuunnitelma", "en": "Business advisory / Business plan" }, "tags": ["yritysneuvonta", "konsultointi"], "profilointi_filter": { "section": "startup_services", "field": "business_advisory", "value": true } },
                    { "label": { "fi": "Kirjanpito ja tilitoimisto", "en": "Bookkeeping and accounting" }, "tags": ["tilitoimisto"] },
                    { "label": { "fi": "Vakuutukset", "en": "Insurance" }, "tags": ["vakuutus"] },
                    { "label": { "fi": "Lakipalvelut", "en": "Legal services" }, "tags": ["lakiasiaintoimistot"] }
                ]
            },
            {
                "id": "nakyvyys",
                "multiple": true,
                "question": { "fi": "Markkinointi ja näkyvyys?", "en": "Marketing and visibility?" },
                "options": [
                    { "label": { "fi": "Verkkosivut / Domain", "en": "Website / Domain" }, "tags": ["verkkosivut", "it-palvelut", "kotisivut"], "profilointi_filter": { "section": "startup_services", "field": "refinement_tags", "value": "verkkosivut" } },
                    { "label": { "fi": "Logo ja brändäys", "en": "Logo and branding" }, "tags": ["mainostoimisto", "graafiset palvelut", "brändäys"], "profilointi_filter": { "section": "startup_services", "field": "refinement_tags", "value": "brändäys" } },
                    { "label": { "fi": "Somemainonta ja Google-näkyvyys", "en": "Social media ads and Google visibility" }, "tags": ["somemainonta", "google-mainonta", "mainostoimisto", "digimarkkinointi"] },
                    { "label": { "fi": "Valokuvaus / Yrityskuvat", "en": "Photography / Business photos" }, "tags": ["valokuvaus", "valokuvaaja"], "profilointi_filter": { "section": "startup_services", "field": "refinement_tags", "value": "yrityskuvat" } }
                ]
            }
        ]
    },
    "yrityksen-kehittaminen": {
        "title": { "fi": "Yrityksen kehittäminen", "en": "Business Development" },
        "icon": "📈",
        "description": { "fi": "Vie yrityksesi seuraavalle tasolle kasvun avulla.", "en": "Take your business to the next level through growth." },
        "profilointi_context": "business_growth",
        "steps": [
            {
                "id": "tarkennus",
                "question": { "fi": "Millaista kehitystä yrityksesi kaipaa?", "en": "What kind of development does your business need?" },
                "options": [
                    { "label": { "fi": "Digitaalinen markkinointi & Myynti", "en": "Digital marketing & Sales" }, "sub_context": "digitaalinen myynti", "tags": ["mainostoimisto"] },
                    { "label": { "fi": "Henkilöstö & Rekrytointi", "en": "Staff & Recruitment" }, "sub_context": "rekrytointi", "tags": ["henkilöstöpalvelut"] },
                    { "label": { "fi": "Liikkeenjohdon konsultointi", "en": "Management consulting" }, "sub_context": "konsultointi", "tags": ["konsultointi"] }
                ]
            },
            {
                "id": "myynti",
                "multiple": true,
                "question": { "fi": "Lisää myyntiä ja tunnettuutta?", "en": "More sales and visibility?" },
                "options": [
                    { "label": { "fi": "Google-mainonta / SEO", "en": "Google ads / SEO" }, "tags": ["google-mainonta", "mainostoimisto"] },
                    { "label": { "fi": "Sosiaalisen median markkinointi", "en": "Social media marketing" }, "tags": ["somemainonta", "mainostoimisto"] },
                    { "label": { "fi": "Verkkokaupan rakentaminen", "en": "Building an online store" }, "tags": ["verkkokauppa", "it-palvelut"] },
                    { "label": { "fi": "Videotuotanto / Mainosvideot", "en": "Video production / Advertising videos" }, "tags": ["videotuotanto", "videomarkkinointi", "video"], "profilointi_filter": { "section": "business_growth", "field": "refinement_tags", "value": "videomarkkinointi" } }
                ]
            },
            {
                "id": "henkilosto",
                "multiple": true,
                "question": { "fi": "Resurssit ja osaaminen?", "en": "Resources and expertise?" },
                "options": [
                    { "label": { "fi": "Rekrytointipalvelut", "en": "Recruitment services" }, "tags": ["henkilöstöpalvelut"] },
                    { "label": { "fi": "Henkilöstön koulutus", "en": "Staff training" }, "tags": ["koulutus"] },
                    { "label": { "fi": "Liikkeenjohdon konsultointi", "en": "Management consulting" }, "tags": ["konsultointi"] }
                ]
            }
        ]
    },
    "vakituinen-palvelukumppani": {
        "title": { "fi": "Vakituinen palvelukumppani", "en": "Service Partner" },
        "icon": "🤝",
        "description": { "fi": "Etsitkö jatkuvaa kumppania helpottamaan arkea?", "en": "Looking for an ongoing partner to help with everyday life?" },
        "profilointi_context": "vapaa-aika",
        "steps": [
            {
                "id": "ala",
                "question": { "fi": "Millä osa-alueella tarvitset kumppania?", "en": "In which area do you need a partner?" },
                "options": [
                    { "label": { "fi": "IT- ja tietotekniikka", "en": "IT and computing" }, "tags": ["it-palvelut", "vakiopalvelu"] },
                    { "label": { "fi": "Siivous ja kiinteistöhuolto", "en": "Cleaning and property maintenance" }, "tags": ["siivous", "kiinteistöhuolto", "vakiopalvelu"] },
                    { "label": { "fi": "Kirjanpito ja taloushallinto", "en": "Accounting and financial management" }, "tags": ["tilitoimisto"] },
                    { "label": { "fi": "Markkinointikumppani", "en": "Marketing partner" }, "tags": ["mainostoimisto", "vakiopalvelu"] }
                ]
            }
        ]
    },
    "paivystavat-palvelut": {
        "title": { "fi": "Päivystävät palvelut", "en": "Emergency Services" },
        "icon": "🚨",
        "description": { "fi": "Apu lähellä silloin kun sitä tarvitaan kiireellisesti.", "en": "Help nearby when you need it urgently." },
        "profilointi_context": "construction_and_maintenance",
        "steps": [
            {
                "id": "kiireellinen",
                "question": { "fi": "Mikä hätänä?", "en": "What is the emergency?" },
                "options": [
                    { "label": { "fi": "LVI- tai putkipäivystys", "en": "HVAC or plumbing emergency" }, "tags": ["LVI", "päivystys"], "profilointi_filter": { "section": "construction_and_maintenance", "field": "emergency_service", "value": true } },
                    { "label": { "fi": "Sähköpäivystys", "en": "Electrical emergency" }, "tags": ["sähköasennukset", "päivystys"], "profilointi_filter": { "section": "construction_and_maintenance", "field": "emergency_service", "value": true } },
                    { "label": { "fi": "Hinaus ja tiepalvelu", "en": "Towing and roadside assistance" }, "tags": ["hinaus"] },
                    { "label": { "fi": "Lukkoseppä (avaimet hukkuneet)", "en": "Locksmith (locked out)" }, "tags": ["lukkoseppä", "päivystys"] }
                ]
            }
        ]
    },
    "terveys-ja-hyvinvointi": {
        "title": { "fi": "Terveys ja hyvinvointi", "en": "Health & Wellbeing" },
        "icon": "🏥",
        "description": { "fi": "Löydä asiantuntijat terveyden ja hyvän olon tueksi.", "en": "Find experts to support your health and wellbeing." },
        "profilointi_context": "wellbeing_and_beauty",
        "steps": [
            {
                "id": "tarkennus",
                "question": { "fi": "Millaista hyvinvointipalvelua etsit?", "en": "What kind of wellbeing service are you looking for?" },
                "options": [
                    { "label": { "fi": "Hieronnat & Kehonhuolto", "en": "Massage & Body care" }, "sub_context": "hieronta", "tags": ["hieronta"], "is_service": true },
                    { "label": { "fi": "Kauneudenhoito & Kampaamot", "en": "Beauty care & Hairdressers" }, "sub_context": "kauneudenhoito", "tags": ["kampaamo", "kauneus"], "is_service": true },
                    { "label": { "fi": "Terveyspalvelut", "en": "Health services" }, "sub_context": "terveyspalvelut", "tags": ["terveyspalvelut"], "is_service": true },
                    { "label": { "fi": "Mielen hyvinvointi & Terapia", "en": "Mental wellbeing & Therapy" }, "sub_context": "terapia", "tags": ["psykologi"], "is_service": true },
                    { "label": { "fi": "Hoivapalvelu ja kotihoito", "en": "Care services and home care" }, "sub_context": "kotihoito", "tags": ["kotihoito"], "is_service": true }
                ]
            }
        ]
    },
    "liikunta-ja-vapaaaika": {
        "title": { "fi": "Liikunta ja vapaa-aika", "en": "Sports & Leisure" },
        "icon": "⚽",
        "description": { "fi": "Harrastuksia ja liikuntaa kaikenikäisille.", "en": "Hobbies and exercise for all ages." },
        "profilointi_context": "wellbeing_and_beauty",
        "steps": [
            {
                "id": "tyyppi",
                "question": { "fi": "Millaista vapaa-ajan kohdetta tai palvelua etsit?", "en": "What kind of leisure venue or service are you looking for?" },
                "options": [
                    { "label": { "fi": "Uinti", "en": "Swimming" }, "tags": ["uinti", "uimahalli", "kylpylä", "peurunka", "vesiliikunta", "avantouinti"], "intent_codes": ["REC_SWIMMING"] },
                    { "label": { "fi": "Koskenlasku", "en": "White-water rafting" }, "tags": ["koskenlasku", "vesiaktiviteetit", "melonta", "varjola", "koskimelonta"], "intent_codes": ["REC_RAFTING"] },
                    { "label": { "fi": "Golf", "en": "Golf" }, "tags": ["golf", "golfkenttä", "golfklubi", "revontuli", "ulkoilu"], "intent_codes": ["REC_GOLF"] },
                    { "label": { "fi": "Ratsastus", "en": "Horse riding" }, "tags": ["ratsastus", "hevonen", "ratsastuskoulu", "vaellus hevosella"], "intent_codes": ["REC_RIDING"] },
                    { "label": { "fi": "Huvipuisto", "en": "Amusement park" }, "tags": ["lapset", "huvipuisto", "nokkakivi", "elämyspalvelut", "perheaktiviteetit"], "intent_codes": ["REC_AMUSEMENT"] },
                    { "label": { "fi": "Luontoretkeily", "en": "Nature hiking" }, "tags": ["retkeily", "luontoretkeily", "luonto", "multamäki", "vaellus", "eräopas", "ohjelmapalvelut"], "intent_codes": ["REC_OUTDOOR"] },
                    { "label": { "fi": "Kuntosali", "en": "Gym" }, "tags": ["kuntosali", "liikuntakeskus", "ohjattu liikunta", "personal trainer", "ryhmäliikunta"], "intent_codes": ["REC_GYM"] }
                ]
            }
        ]
    },
    "elaimet": {
        "title": { "fi": "Eläimet ja lemmikit", "en": "Animals and Pets" },
        "icon": "🐾",
        "description": { "fi": "Kaikki lemmikkisi parhaaksi.", "en": "Everything for your pet's best." },
        "profilointi_context": "wellbeing_and_beauty",
        "steps": [
            {
                "id": "tarve",
                "multiple": true,
                "question": { "fi": "Mitä lemmikkisi tarvitsee?", "en": "What does your pet need?" },
                "options": [
                    { "label": { "fi": "Eläinlääkäri", "en": "Veterinarian" }, "sub_context": "elainlaakari", "tags": ["eläinlääkäri"] },
                    { "label": { "fi": "Lemmikkitarvikkeet / Ruoka", "en": "Pet supplies / Food" }, "sub_context": "elaintarvikkeet", "tags": ["lemmikkitarvikkeet"] },
                    { "label": { "fi": "Trimmaus / Pesu", "en": "Grooming / Washing" }, "sub_context": "trimmaus", "tags": ["trimmaus"] },
                    { "label": { "fi": "Koulutus / Hoito", "en": "Training / Care" }, "sub_context": "elainhoitola", "tags": ["koirahoitola", "eläinkoulutus"] }
                ]
            },
            {
                "id": "elainlaji",
                "question": { "fi": "Minkä eläimen palveluita etsit?", "en": "Which animal's services are you looking for?" },
                "options": [
                    { "label": { "fi": "Koira", "en": "Dog" }, "tags": ["koira"] },
                    { "label": { "fi": "Kissa", "en": "Cat" }, "tags": ["kissa"] },
                    { "label": { "fi": "Hevonen", "en": "Horse" }, "tags": ["hevonen"] },
                    { "label": { "fi": "Pieneläimet", "en": "Small animals" }, "tags": ["pieneläin"] }
                ]
            }
        ]
    },
    "lapset-ja-perhe": {
        "title": { "fi": "Lapset ja perhe", "en": "Children & Family" },
        "icon": "👶",
        "description": { "fi": "Arjen tukea ja harrastuksia lapsiperheille.", "en": "Everyday support and hobbies for families with children." },
        "profilointi_context": "wellbeing_and_beauty",
        "steps": [
            {
                "id": "palvelut",
                "multiple": true,
                "question": { "fi": "Millaista palvelua etsitte?", "en": "What kind of service are you looking for?" },
                "options": [
                    { "label": { "fi": "Päivähoito / Koulutus", "en": "Daycare / Education" }, "sub_context": "paivahoito", "tags": ["päiväkoti", "koulutus"] },
                    { "label": { "fi": "Harrastukset lapsille", "en": "Hobbies for children" }, "sub_context": "lasten harrastukset", "tags": ["lapset", "harrastukset"] },
                    { "label": { "fi": "Lastentarvikkeet", "en": "Children's supplies" }, "sub_context": "lastentarvikkeet", "tags": ["erikoisliikkeet", "lapset"] },
                    { "label": { "fi": "Perheterapia / Tuki", "en": "Family therapy / Support" }, "sub_context": "perhetuki", "tags": ["psykologi", "perhepalvelut"] }
                ]
            },
            {
                "id": "ika",
                "question": { "fi": "Minkä ikäisistä lapsista on kyse?", "en": "What age are the children?" },
                "options": [
                    { "label": { "fi": "Vauvat ja taaperot (0-3v)", "en": "Babies and toddlers (0-3y)" }, "tags": ["vauva"] },
                    { "label": { "fi": "Leikki-ikäiset (3-6v)", "en": "Preschoolers (3-6y)" }, "tags": ["lapset"] },
                    { "label": { "fi": "Koululaiset", "en": "School-age children" }, "tags": ["koululainen"] },
                    { "label": { "fi": "Nuoret / Teinit", "en": "Youth / Teens" }, "tags": ["nuoret"] }
                ]
            }
        ]
    }
};

const NEEDS_CATEGORY_ICONS = {
    'Palvelut': '🛠️',
    'Kaupat ja putiikit': '🛍️',
    'Ravintolat ja kahvilat': '☕',
    'Terveys ja hyvinvointi': '🏥',
    'Kulttuuri ja vapaa-aika': '🎨',
    'Majoitus': '🏨',
    'Teollisuus ja rakentaminen': '🏗️',
    'Asiantuntijapalvelut': '👔',
    'Maa- ja metsätalous': '🚜',
    'Kuljetus ja logistiikka': '🚚',
    'Autoilu ja liikenne': '🚗',
    'Kauneus ja terveys': '💇',
    'Urheilu ja ulkoilu': '⚽',
    'Kiinteistöt ja asuminen': '🏠',
    'Lapsiperheet ja koulutus': '👶',
    'Eläimet ja lemmikit': '🐾',
    'Matkailu': '🌍',
    'Juhlat ja tapahtumat': '🎉'
};

if (typeof window !== 'undefined') {
    window.categoryIcons = NEEDS_CATEGORY_ICONS;
    window.NEEDS_CONFIG = NEEDS_CONFIG;
}
