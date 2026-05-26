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
                    { "id": "OPT_WED_TRADITIONAL", "label": { "fi": "Perinteiset häät", "en": "Traditional Wedding" }, "sub_context": "perinteiset häät", "tags": ["häät"], "intent_codes": ["EVT_WEDDING"] },
                    { "id": "OPT_WED_SMALL", "label": { "fi": "Pienet häät / Intiimi juhla", "en": "Small Wedding / Intimate Celebration" }, "sub_context": "pienet häät", "tags": ["häät"], "intent_codes": ["EVT_WEDDING"] },
                    { "id": "OPT_WED_THEME", "label": { "fi": "Teemahäät / Modernit häät", "en": "Theme Wedding / Modern Wedding" }, "sub_context": "teemahäät", "tags": ["häät"], "intent_codes": ["EVT_WEDDING"] },
                    { "id": "OPT_WED_CEREMONY", "label": { "fi": "Vain vihkiminen ja kahvitus", "en": "Ceremony and Coffee Reception only" }, "sub_context": "vihkiminen", "tags": ["häät"], "intent_codes": ["EVT_WEDDING"] }
                ]
            },
            {
                "id": "tila",
                "question": { "fi": "Millaista juhlatilaa etsit?", "en": "What kind of party venue are you looking for?" },
                "options": [
                    { "id": "OPT_WED_VENUE_LARGE", "label": { "fi": "Iso juhlatila (yli 50 hlö)", "en": "Large party venue (over 50 ppl)" }, "tags": ["juhlatila"], "capacity_req": 100, "node_link": "JUHLATILA", "intent_codes": ["VENUE_PARTY"] },
                    { "id": "OPT_WED_VENUE_SMALL", "label": { "fi": "Keskikokoinen / Pieni tila (alle 50 hlö)", "en": "Medium / Small venue (under 50 ppl)" }, "tags": ["juhlatila"], "capacity_req": 50, "node_link": "JUHLATILA", "intent_codes": ["VENUE_PARTY"] },
                    { "id": "OPT_WED_VENUE_MANOR", "label": { "fi": "Tunnelmallinen kartano", "en": "Atmospheric manor" }, "tags": ["kartano", "juhlatila"], "capacity_req": 50, "node_link": "JUHLATILA", "intent_codes": ["VENUE_PARTY"] },
                    { "id": "OPT_WED_VENUE_NATURE", "label": { "fi": "Luonnonläheinen tila", "en": "Nature-oriented space" }, "tags": ["luonto", "juhlatila"], "capacity_req": 30, "node_link": "JUHLATILA", "intent_codes": ["VENUE_PARTY"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "ranta" } },
                    { "id": "OPT_WED_VENUE_OWN_CATERING", "label": { "fi": "Tila omilla tarjoiluilla", "en": "Venue with own catering allowed" }, "tags": ["juhlatila"], "capacity_req": 50, "node_link": "JUHLATILA", "intent_codes": ["VENUE_PARTY"], "profilointi_filter": { "section": "events_and_celebrations", "field": "own_catering_allowed", "value": true } },
                    { "id": "OPT_WED_VENUE_NONE", "label": { "fi": "Omissa tiloissa (ei tilatarvetta)", "en": "At our own premises (no venue needed)" }, "hide_results": true }
                ]
            },
            {
                "id": "palvelut",
                "multiple": true,
                "question": { "fi": "Mitä palveluita tarvitset juhlapäivään?", "en": "What services do you need for the wedding day?" },
                "options": [
                    { "id": "OPT_WED_SERVICE_CATERING", "label": { "fi": "Pitopalvelu", "en": "Catering service" }, "tags": ["pitopalvelu"], "intent_codes": ["BIZ_CATERING"] },
                    { "id": "OPT_WED_SERVICE_CAKE", "label": { "fi": "Hääkakku / Leivonnaiset", "en": "Wedding cake / Pastries" }, "tags": ["leipomo", "elintarvike", "pitopalvelu"], "intent_codes": ["BIZ_CATERING"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "juhlakakku" } },
                    { "id": "OPT_WED_SERVICE_PHOTO", "label": { "fi": "Valokuvaaja", "en": "Photographer" }, "tags": ["valokuvaus", "valokuvaaja"], "intent_codes": ["MEDIA_PHOTO"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "hääkuvaus" } },
                    { "id": "OPT_WED_SERVICE_VIDEO", "label": { "fi": "Videokuvaaja", "en": "Videographer" }, "tags": ["videotuotanto", "videokuvaus", "videokuvaaja"], "intent_codes": ["MEDIA_VIDEO"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "häävideo" } },
                    { "id": "OPT_WED_SERVICE_FLORIST", "label": { "fi": "Kukkakauppa & Koristelu", "en": "Flower shop & Decoration" }, "tags": ["kukkakauppa", "kukat"], "intent_codes": ["BIZ_FLORIST"] },
                    { "id": "OPT_WED_SERVICE_MUSIC", "label": { "fi": "Musiikki tai DJ", "en": "Music or DJ" }, "tags": ["musiikki", "ohjelmapalvelut"], "intent_codes": ["ENT_MUSIC"], "profilointi_filter": { "section": "events_and_celebrations", "field": "entertainment_features", "value": "live-musiikki" } },
                    { "id": "OPT_WED_SERVICE_PROGRAM", "label": { "fi": "Ohjelmapalvelut / Esiintyjät", "en": "Entertainment / Performers" }, "tags": ["ohjelmapalvelut"], "intent_codes": ["ENT_PROGRAM"] },
                    { "id": "OPT_WED_SERVICE_PLANNER", "label": { "fi": "Hääsuunnittelija / Koordinaattori", "en": "Wedding planner / Coordinator" }, "tags": ["ohjelmapalvelut", "tapahtumatuotanto"], "intent_codes": ["ENT_PROGRAM"] }
                ]
            },
            {
                "id": "vieraat",
                "multiple": true,
                "question": { "fi": "Tarpeet vieraiden mukavuuteen?", "en": "Needs for guest comfort?" },
                "skipIf": "getSelectedCompanyProfilointi('tila', 'events_and_celebrations', 'accommodation_available')",
                "skipMessage": { "fi": "Valitsemassasi tilassa majoitus sisältyy pakettiin — ei tarvetta erikseen.", "en": "Accommodation is included in the package at your selected venue — no separate need." },
                "options": [
                    { "id": "OPT_WED_GUEST_STAY", "label": { "fi": "Majoitus vieraille", "en": "Accommodation for guests" }, "tags": ["majoitus"], "intent_codes": ["VENUE_ACCOMMODATION"] },
                    { "id": "OPT_WED_GUEST_TRANSPORT", "label": { "fi": "Kuljetus / Bussi / Taksi", "en": "Transport / Bus / Taxi" }, "tags": ["taksi", "kuljetus"], "intent_codes": ["BIZ_TRANSPORT"] },
                    { "id": "OPT_WED_GUEST_BEAUTY", "label": { "fi": "Kauneuspalvelut / Meikki", "en": "Beauty services / Makeup" }, "tags": ["kauneus", "kampaamo"], "intent_codes": ["WELLBEING_BEAUTY"] }
                ]
            },
            {
                "id": "tallennus_ja_muistot",
                "multiple": true,
                "question": { "fi": "Haluaisitko ikuistaa päivän digitaalisesti tai tarvitsetko muita digitointipalveluita?", "en": "Would you like to capture the day digitally or do you need other digitization services?" },
                "options": [
                    { "id": "OPT_WED_DIGI_EDIT", "label": { "fi": "Häävideon editointi / Koostepalvelu", "en": "Wedding video editing / Compilation service" }, "tags": ["videotuotanto", "häävideon editointi"], "node_link": "DIGITOINTI", "intent_codes": ["MEDIA_VIDEO"], "profilointi_filter": { "section": "events_and_celebrations", "field": "digitization_features", "value": "häävideo editointi" } },
                    { "id": "OPT_WED_DIGI_DRONE", "label": { "fi": "Drone-kuvaus", "en": "Drone filming" }, "tags": ["drone", "drone-kuvaus"], "node_link": "DIGITOINTI", "intent_codes": ["MEDIA_DRONE"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "drone-kuvaus" } },
                    { "id": "OPT_WED_DIGI_ALL", "label": { "fi": "Digitointipalvelut (kuvat, videot ym.)", "en": "Digitization services (photos, videos etc.)" }, "tags": ["digitointi"], "node_link": "DIGITOINTI", "intent_codes": ["MEDIA_DIGITIZATION"] }
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
                "hide_results": true,
                "question": { "fi": "Millaista tilaisuutta olet järjestämässä?", "en": "What kind of event are you organizing?" },
                "options": [
                    { "id": "OPT_CORP_PARTY_XMAS", "label": { "fi": "Pikkujoulut", "en": "Christmas Party" }, "sub_context": "pikkujoulut" },
                    { "id": "OPT_CORP_PARTY_SUMMER", "label": { "fi": "Henkilöstöjuhlat / Kesäjuhlat", "en": "Staff Party / Summer Party" }, "sub_context": "henkilöstöjuhlat" },
                    { "id": "OPT_CORP_PARTY_TEAM", "label": { "fi": "Virkistyspäivä / Tyky-päivä", "en": "Team Day / Wellness Day" }, "sub_context": "tyky-paiva", "tags": ["ohjelmapalvelut"], "intent_codes": ["ENT_PROGRAM"] }
                ]
            },
            {
                "id": "tila",
                "question": { "fi": "Missä haluatte juhlia?", "en": "Where do you want to celebrate?" },
                "options": [
                    { "id": "OPT_CORP_PARTY_VENUE_SMALL", "label": { "fi": "Juhlatila (alle 50 henkilöä)", "en": "Venue (under 50 people)" }, "tags": ["juhlatila"], "capacity_req": 50, "intent_codes": ["VENUE_PARTY"], "node_link": "JUHLATILA" },
                    { "id": "OPT_CORP_PARTY_VENUE_LARGE", "label": { "fi": "Juhlatila (yli 50 henkilöä)", "en": "Venue (over 50 people)" }, "tags": ["juhlatila"], "capacity_req": 100, "intent_codes": ["VENUE_PARTY"], "node_link": "JUHLATILA" },
                    { "id": "OPT_CORP_PARTY_VENUE_NONE", "label": { "fi": "Omissa tiloissa (ei tilatarvetta)", "en": "At our own premises (no venue needed)" }, "hide_results": true }
                ]
            },
            {
                "id": "palvelut",
                "multiple": true,
                "question": { "fi": "Mitä lisäpalveluita tarvitsette?", "en": "What additional services do you need?" },
                "options": [
                    { "id": "OPT_CORP_PARTY_CATERING", "label": { "fi": "Pitopalvelu", "en": "Catering" }, "tags": ["pitopalvelu"], "intent_codes": ["BIZ_CATERING"] },
                    { "id": "OPT_CORP_PARTY_STAY", "label": { "fi": "Majoitus", "en": "Accommodation" }, "tags": ["majoitus"], "intent_codes": ["VENUE_ACCOMMODATION"] },
                    { "id": "OPT_CORP_PARTY_TRANSPORT", "label": { "fi": "Kuljetukset", "en": "Transport" }, "tags": ["kuljetus", "taksi"], "intent_codes": ["BIZ_TRANSPORT"] },
                    { "id": "OPT_CORP_PARTY_VIDEO", "label": { "fi": "Videokuvaus", "en": "Video recording" }, "tags": ["videotuotanto", "videokuvaus"], "intent_codes": ["MEDIA_VIDEO"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "videotuotanto" } },
                    { "id": "OPT_CORP_PARTY_PHOTO", "label": { "fi": "Valokuvaus", "en": "Photography" }, "tags": ["valokuvaus", "valokuvaaja"], "intent_codes": ["MEDIA_PHOTO"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "juhlakuvaus" } },
                    { "id": "OPT_CORP_PARTY_SAUNA", "label": { "fi": "Saunatilat", "en": "Sauna facilities" }, "tags": ["saunatilat"], "intent_codes": ["VENUE_PARTY"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "sauna" } },
                    { "id": "OPT_CORP_PARTY_PROGRAM", "label": { "fi": "Ohjelmapalvelut / Elämykset", "en": "Entertainment / Experiences" }, "tags": ["ohjelmapalvelut"], "intent_codes": ["ENT_PROGRAM"] },
                    { "id": "OPT_CORP_PARTY_AV", "label": { "fi": "AV-tekniikka & Äänentoisto", "en": "AV tech & Sound" }, "tags": ["it-palvelut"], "intent_codes": ["MEDIA_VIDEO"], "profilointi_filter": { "section": "events_and_celebrations", "field": "has_av_tech", "value": true }, "exclude_if_capacity": true }
                ]
            },
            {
                "id": "hyvinvointi",
                "multiple": true,
                "question": { "fi": "Tarvitsetteko hyvinvointia tai ohjelmaa tyky-päivään?", "en": "Do you need wellbeing activities or a program for the team day?" },
                "options": [
                    { "id": "OPT_CORP_PARTY_WELLBEING", "label": { "fi": "Yrityshyvinvointi / Luennot", "en": "Corporate wellbeing / Lectures" }, "tags": ["hyvinvointi"] },
                    { "id": "OPT_CORP_PARTY_EXERCISE", "label": { "fi": "Ohjattu liikunta / Jooga", "en": "Guided exercise / Yoga" }, "tags": ["liikunta"] },
                    { "id": "OPT_CORP_PARTY_NATURE", "label": { "fi": "Luontoelämykset / Eräopas", "en": "Nature experiences / Wilderness guide" }, "tags": ["ohjelmapalvelut", "eräopas"] }
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
                "hide_results": true,
                "question": { "fi": "Millaista tilaisuutta olette järjestämässä?", "en": "What kind of event are you organizing?" },
                "options": [
                    { "id": "OPT_BIZ_MEETING", "label": { "fi": "Kokous / Neuvottelu", "en": "Meeting / Negotiation" }, "sub_context": "kokous" },
                    { "id": "OPT_BIZ_SEMINAR", "label": { "fi": "Seminaari / Koulutus", "en": "Seminar / Training" }, "sub_context": "seminaari" },
                    { "id": "OPT_BIZ_CONFERENCE", "label": { "fi": "Konferenssi / Suuri tilaisuus", "en": "Conference / Large event" }, "sub_context": "konferenssi" }
                ]
            },
            {
                "id": "tila",
                "question": { "fi": "Missä haluatte järjestää tilaisuuden?", "en": "Where do you want to hold the event?" },
                "options": [
                    { "id": "OPT_BIZ_VENUE_SMALL", "label": { "fi": "Kokoustila (alle 50 henkilöä)", "en": "Meeting room (under 50 people)" }, "tags": ["kokoustilat"], "capacity_req": 50, "intent_codes": ["VENUE_MEETING"], "node_link": "JUHLATILA" },
                    { "id": "OPT_BIZ_VENUE_LARGE", "label": { "fi": "Seminaari- tai juhlatila (yli 50 henkilöä)", "en": "Seminar or party venue (over 50 people)" }, "tags": ["seminaaritilat", "kokoustilat"], "capacity_req": 100, "intent_codes": ["VENUE_MEETING"], "node_link": "JUHLATILA" },
                    { "id": "OPT_BIZ_VENUE_NONE", "label": { "fi": "Omissa tiloissa (ei tilatarvetta)", "en": "At our own premises (no venue needed)" }, "hide_results": true }
                ]
            },
            {
                "id": "tarjoilu",
                "question": { "fi": "Tarjoilut tilaisuuteen?", "en": "Catering for the event?" },
                "options": [
                    { "id": "OPT_BIZ_CATERING_LUNCH", "label": { "fi": "Lounas ja kahvitus", "en": "Lunch and coffee" }, "tags": ["ravintola", "pitopalvelu"] },
                    { "id": "OPT_BIZ_CATERING_SNACK", "label": { "fi": "Iltapala", "en": "Evening snack" }, "tags": ["ravintola"] },
                    { "id": "OPT_BIZ_CATERING_NONE", "label": { "fi": "Ei tarjoilua", "en": "No catering" }, "tags": [] }
                ]
            },
            {
                "id": "lisat",
                "multiple": true,
                "question": { "fi": "Muut tarpeet?", "en": "Other needs?" },
                "options": [
                    { "id": "OPT_BIZ_STAY", "label": { "fi": "Majoitus", "en": "Accommodation" }, "tags": ["majoitus"], "intent_codes": ["VENUE_ACCOMMODATION"] },
                    { "id": "OPT_BIZ_VIDEO", "label": { "fi": "Videokuvaus", "en": "Video recording" }, "tags": ["videotuotanto", "videokuvaus", "videokuvaaja"], "intent_codes": ["MEDIA_VIDEO"], "profilointi_filter": { "section": "business_events", "field": "refinement_tags", "value": "yritysvideo" } },
                    { "id": "OPT_BIZ_PHOTO", "label": { "fi": "Valokuvaus", "en": "Photography" }, "tags": ["valokuvaus", "valokuvaaja"], "intent_codes": ["MEDIA_PHOTO"], "profilointi_filter": { "section": "business_events", "field": "refinement_tags", "value": "yrityskuvaus" } },
                    { "id": "OPT_BIZ_IT", "label": { "fi": "IT-tuki / AV-tekniikka", "en": "IT support / AV tech" }, "tags": ["it-palvelut"], "intent_codes": ["BIZ_IT"], "profilointi_filter": { "section": "business_events", "field": "has_projector", "value": true }, "exclude_if_capacity": true }
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
                "hide_results": true,
                "question": { "fi": "Kenen juhlia järjestetään?", "en": "Who is the celebration for?" },
                "options": [
                    { "id": "OPT_BDAY_KIDS", "label": { "fi": "Lasten syntymäpäivät", "en": "Children's birthday" }, "sub_context": "lasten synttärit", "tags": ["lapset"], "intent_codes": ["EVT_BIRTHDAY_KIDS"] },
                    { "id": "OPT_BDAY_ADULTS", "label": { "fi": "Nuorten / Aikuisten juhlat", "en": "Teen / Adult party" }, "sub_context": "aikuisten synttärit", "require_fits_for": { "key": "events-and-celebrations", "min": 60 }, "capacity_req": 1, "intent_codes": ["EVT_BIRTHDAY_ADULTS"] },
                    { "id": "OPT_BDAY_FAMILY", "label": { "fi": "Pyöreät vuodet / Sukujuhlat", "en": "Milestone birthday / Family celebration" }, "sub_context": "sukujuhlat", "require_fits_for": { "key": "events-and-celebrations", "min": 60 }, "capacity_req": 1, "intent_codes": ["EVT_BIRTHDAY_FAMILY"] }
                ]
            },
            {
                "id": "tila",
                "question": { "fi": "Missä haluat juhlia?", "en": "Where do you want to celebrate?" },
                "options": [
                    { "id": "OPT_BDAY_VENUE_SMALL", "label": { "fi": "Juhlatila (alle 50 henkilöä)", "en": "Venue (under 50 people)" }, "tags": ["ravintola", "juhlatila"], "capacity_req": 50, "intent_codes": ["VENUE_PARTY"], "node_link": "JUHLATILA" },
                    { "id": "OPT_BDAY_VENUE_LARGE", "label": { "fi": "Juhlatila (yli 50 henkilöä)", "en": "Venue (over 50 people)" }, "tags": ["ravintola", "juhlatila"], "capacity_req": 100, "intent_codes": ["VENUE_PARTY"], "node_link": "JUHLATILA" },
                    { "id": "OPT_BDAY_VENUE_NONE", "label": { "fi": "Kotona (tarvitaan palveluita)", "en": "At home (services needed)" }, "hide_results": true }
                ]
            },
            {
                "id": "palvelut",
                "multiple": true,
                "question": { "fi": "Mitä tarvitaan onnistuneisiin juhliin?", "en": "What do you need for a successful party?" },
                "options": [
                    { "id": "OPT_BDAY_SERVICE_CATERING", "label": { "fi": "Pitopalvelu / Ruoat", "en": "Catering / Food" }, "tags": ["pitopalvelu"], "intent_codes": ["BIZ_CATERING"] },
                    { "id": "OPT_BDAY_SERVICE_CAKE", "label": { "fi": "Kakut / Leivonnaiset", "en": "Cakes / Pastries" }, "tags": ["leipomo", "elintarvike"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "juhlakakku" } },
                    { "id": "OPT_BDAY_SERVICE_PROGRAM", "label": { "fi": "Ohjelma / Esiintyjä", "en": "Entertainment / Performer" }, "tags": ["ohjelmapalvelut"], "intent_codes": ["ENT_PROGRAM"] },
                    { "id": "OPT_BDAY_SERVICE_PHOTO", "label": { "fi": "Valokuvaus", "en": "Photography" }, "tags": ["valokuvaus"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "juhlakuvaus" } },
                    { "id": "OPT_BDAY_SERVICE_VIDEO", "label": { "fi": "Videokuvaus", "en": "Video recording" }, "tags": ["videotuotanto", "videokuvaus"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "juhlakuvaus" } },
                    { "id": "OPT_BDAY_SERVICE_FLORIST", "label": { "fi": "Kukat", "en": "Flowers" }, "tags": ["kukkakauppa", "kukat"], "intent_codes": ["BIZ_FLORIST"] }
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
                    { "id": "OPT_MOVE_SERVICE_FULL", "label": { "fi": "Muuttopalvelu (auto + kantajat)", "en": "Moving service (van + carriers)" }, "intent_codes": ["MOVE_FULL"], "tags": ["kuljetusliike", "muuttopalvelu"] },
                    { "id": "OPT_MOVE_TRANSPORT_ONLY", "label": { "fi": "Vain kuljetus / Peräkärry", "en": "Transport only / Trailer" }, "intent_codes": ["MOVE_TRANSPORT"], "tags": ["kuljetus", "hinaus"] },
                    { "id": "OPT_MOVE_STORAGE", "label": { "fi": "Varastointipalvelu", "en": "Storage service" }, "intent_codes": ["MOVE_STORAGE"], "tags": ["varastointi"] }
                ]
            },
            {
                "id": "asunto",
                "multiple": true,
                "question": { "fi": "Uuden kodin valmistelu?", "en": "Preparing your new home?" },
                "options": [
                    { "id": "OPT_MOVE_CLEANING", "label": { "fi": "Muuttosiivous", "en": "Moving clean" }, "intent_codes": ["MOVE_CLEANING"], "tags": ["siivous", "puhdistuspalvelut"] },
                    { "id": "OPT_MOVE_ELECTRICITY", "label": { "fi": "Sähkösopimus / Sähköasennukset", "en": "Electricity contract / Electrical installations" }, "intent_codes": ["MOVE_ELECTRICITY"], "tags": ["sähköasennukset"] },
                    { "id": "OPT_MOVE_RENO_SMALL", "label": { "fi": "Pieni pintaremontti", "en": "Minor surface renovation" }, "intent_codes": ["MOVE_RENO"], "tags": ["maalaustyöt", "rakentaminen"] }
                ]
            }
        ]
    },
    "remontti": {
        "title": { "fi": "Remontti & Talon huolto", "en": "Renovation & Maintenance" },
        "icon": "🔨",
        "description": { "fi": "Löydä tekijät ja tarvikkeet kodin uudistukseen ja ylläpitoon, kuten remontteihin ja nuohoukseen.", "en": "Find professionals and materials for home renovation and maintenance tasks like chimney sweeping." },
        "profilointi_context": "construction_and_maintenance",
        "steps": [
            {
                "id": "tarkennus",
                "question": { "fi": "Mitä olet remontoimassa tai huoltamassa?", "en": "What are you renovating or maintaining?" },
                "options": [
                    { "id": "OPT_RENO_BATHROOM", "label": { "fi": "Kylpyhuoneremontti", "en": "Bathroom renovation" }, "intent_codes": ["RENO_BATHROOM"], "sub_context": "kylpyhuoneremontti", "tags": ["LVI", "rakentaminen"] },
                    { "id": "OPT_RENO_KITCHEN", "label": { "fi": "Keittiöremontti", "en": "Kitchen renovation" }, "intent_codes": ["RENO_KITCHEN"], "sub_context": "keittiöremontti", "tags": ["rakentaminen"] },
                    { "id": "OPT_RENO_SURFACE", "label": { "fi": "Pintaremontti (maalaus tms.)", "en": "Surface renovation (painting etc.)" }, "intent_codes": ["RENO_SURFACE"], "sub_context": "pintaremontti", "tags": ["maalaustyöt"] },
                    { "id": "OPT_RENO_MAINTENANCE", "label": { "fi": "Talon huolto & Kunnossapito (nuohous, ilmanvaihto ym.)", "en": "House maintenance & Upkeep (sweeping, ventilation etc.)" }, "intent_codes": ["COTTAGE_SWEEP", "PROP_MAINTENANCE"], "sub_context": "talon huolto", "tags": ["nuohous", "nuohouspalvelut", "kiinteistöhuolto", "ilmanvaihto"] },
                    { "id": "OPT_RENO_NEW_BUILD", "label": { "fi": "Uudisrakentaminen", "en": "New construction" }, "intent_codes": ["RENO_NEW"], "sub_context": "uudisrakentaminen", "tags": ["rakentaminen"] }
                ]
            },
            {
                "id": "tekijat",
                "multiple": true,
                "question": { "fi": "Millaista ammattilaista etsit?", "en": "What kind of professional are you looking for?" },
                "options": [
                    { "id": "OPT_RENO_PRO_BUILDER", "label": { "fi": "Rakennus- / Remonttimies", "en": "Builder / Handyman" }, "intent_codes": ["RENO_BUILDER"], "tags": ["rakentaminen", "rakennustyöt"] },
                    { "id": "OPT_RENO_PRO_ELECTRICIAN", "label": { "fi": "Sähköasentaja", "en": "Electrician" }, "intent_codes": ["RENO_ELECTRICIAN"], "tags": ["sähköasennukset"] },
                    { "id": "OPT_RENO_PRO_PLUMBER", "label": { "fi": "LVI-asentaja (Putkimies)", "en": "HVAC installer (Plumber)" }, "intent_codes": ["RENO_PLUMBER"], "tags": ["LVI"] },
                    { "id": "OPT_RENO_PRO_PAINTER", "label": { "fi": "Maalari / Tapetoija", "en": "Painter / Wallpaper installer" }, "intent_codes": ["RENO_PAINTER"], "tags": ["maalaustyöt"] },
                    { "id": "OPT_RENO_PRO_SWEEPER", "label": { "fi": "Nuohooja", "en": "Chimney sweeper" }, "intent_codes": ["COTTAGE_SWEEP"], "tags": ["nuohous", "nuohouspalvelut"], "is_service": true },
                    { "id": "OPT_RENO_PRO_MAINTENANCE", "label": { "fi": "Kiinteistöhuolto / Talonmies", "en": "Property maintenance / Caretaker" }, "intent_codes": ["PROP_MAINTENANCE"], "tags": ["kiinteistöhuolto"] },
                    { "id": "OPT_RENO_PRO_CARPENTER", "label": { "fi": "Puuseppä / Kalustekorjaus", "en": "Carpenter / Furniture repair" }, "intent_codes": ["RENO_CARPENTER"], "tags": ["puutyöt", "kalusteet", "puuseppä"], "profilointi_filter": { "section": "construction_and_maintenance", "field": "refinement_tags", "value": "kalustekorjaus" } },
                    { "id": "OPT_RENO_PRO_DESIGNER", "label": { "fi": "Suunnittelija / Arkkitehti", "en": "Designer / Architect" }, "intent_codes": ["RENO_DESIGNER"], "tags": ["suunnittelutoimisto"] }
                ]
            },
            {
                "id": "tarvikkeet",
                "question": { "fi": "Mistä hankit materiaalit?", "en": "Where do you get materials?" },
                "options": [
                    { "id": "OPT_RENO_MAT_HARDWARE", "label": { "fi": "Rautakauppa / Rakennustarvikkeet", "en": "Hardware store / Building supplies" }, "intent_codes": ["RENO_HARDWARE"], "tags": ["rautakauppa", "rakennustarvikkeet"] },
                    { "id": "OPT_RENO_MAT_RENTAL", "label": { "fi": "Koneiden ja laitteiden vuokraus", "en": "Machine and equipment rental" }, "intent_codes": ["RENO_RENTAL"], "tags": ["rakennuskonevuokraus"] },
                    { "id": "OPT_RENO_MAT_INTERIOR", "label": { "fi": "Sisustustuotteet", "en": "Interior decoration products" }, "intent_codes": ["RENO_INTERIOR"], "tags": ["kaupat ja ostokset", "erikoisliikkeet"] },
                    { "id": "OPT_RENO_MAT_NONE", "label": { "fi": "Ei tarvetta materiaaleille (ostetaan palveluna)", "en": "No need for materials (purchased as service)" }, "hide_results": true }
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
                    { "id": "OPT_COTTAGE_CARE", "label": { "fi": "Talvivalvonta & Huolenpito", "en": "Winter surveillance & Care", "intent_codes": ["COTTAGE_CARE"] }, "sub_context": "talvivalvonta", "tags": ["kiinteistöhuolto"], "is_service": true },
                    { "id": "OPT_COTTAGE_CLEAN", "label": { "fi": "Kevätkunnostus / Siivous", "en": "Spring maintenance / Cleaning", "intent_codes": ["COTTAGE_CLEANING"] }, "sub_context": "kevatkunnostus", "tags": ["siivous"] },
                    { "id": "OPT_COTTAGE_FIREWOOD_BASE", "label": { "fi": "Polttopuut & Peruspalvelut", "en": "Firewood & Basic services", "intent_codes": ["COTTAGE_FIREWOOD"] }, "sub_context": "polttopuut", "tags": ["polttopuut"] },
                    { "id": "OPT_COTTAGE_RENO", "label": { "fi": "Remontointi & Laiturit", "en": "Renovation & Docks", "intent_codes": ["COTTAGE_RENO"] }, "sub_context": "mokkiremontti", "tags": ["rakentaminen"] }
                ]
            },
            {
                "id": "perushuolto",
                "multiple": true,
                "question": { "fi": "Mitä huoltoa mökki kaipaa?", "en": "What maintenance does the cottage need?" },
                "options": [
                    { "id": "OPT_COTTAGE_MAINTENANCE", "label": { "fi": "Kiinteistöhuolto / Talonmies", "en": "Property maintenance / Caretaker", "intent_codes": ["COTTAGE_MAINTENANCE"] }, "tags": ["kiinteistöhuolto"], "profilointi_filter": { "section": "cottage_services", "field": "key_holding", "value": true } },
                    { "id": "OPT_COTTAGE_SWEEP", "label": { "fi": "Nuohous", "en": "Chimney sweeping", "intent_codes": ["COTTAGE_SWEEP"] }, "sub_context": "nuohous", "tags": ["nuohous", "nuohouspalvelut"], "is_service": true },
                    { "id": "OPT_COTTAGE_FIREWOOD", "label": { "fi": "Polttopuut", "en": "Firewood", "intent_codes": ["COTTAGE_FIREWOOD"] }, "sub_context": "polttopuut", "tags": ["polttopuut"] },
                    { "id": "OPT_COTTAGE_DOCK", "label": { "fi": "Laituritarvikkeet / Huolto", "en": "Dock supplies / Maintenance", "intent_codes": ["COTTAGE_DOCK"] }, "tags": ["rakentaminen"], "profilointi_filter": { "section": "cottage_services", "field": "dock_maintenance", "value": true } }
                ]
            },
            {
                "id": "piha-ja-tekniikka",
                "multiple": true,
                "question": { "fi": "Pihan ja tekniikan tarpeet?", "en": "Yard and technical needs?" },
                "options": [
                    { "id": "OPT_COTTAGE_YARD", "label": { "fi": "Pihanhoito / Viherrakentaminen", "en": "Yard care / Landscaping" }, "intent_codes": ["COTTAGE_YARD"], "tags": ["viherrakentaminen", "pihasuunnittelu"] },
                    { "id": "OPT_COTTAGE_MACHINE", "label": { "fi": "Pienkonehuolto (ruohonleikkurit ym.)", "en": "Small machine maintenance (lawn mowers etc.)" }, "intent_codes": ["COTTAGE_MACHINE"], "tags": ["pienkonehuolto"] },
                    { "id": "OPT_COTTAGE_TRANSPORT", "label": { "fi": "Taksi / Kuljetus", "en": "Taxi / Transport" }, "intent_codes": ["BIZ_TRANSPORT"], "tags": ["taksi", "kuljetus"] }
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
                    { "id": "OPT_HOUSING_MAINTENANCE", "label": { "fi": "Jatkuva kiinteistöhuolto", "en": "Ongoing property maintenance" }, "intent_codes": ["PROP_MAINTENANCE"], "sub_context": "kiinteistöhuolto", "tags": ["kiinteistöhuolto"] },
                    { "id": "OPT_HOUSING_MANAGEMENT", "label": { "fi": "Isännöintipalvelut", "en": "Property management services" }, "intent_codes": ["PROP_MANAGEMENT"], "sub_context": "isännöinti", "tags": ["isännöinti"] },
                    { "id": "OPT_HOUSING_RENO", "label": { "fi": "Kertaluonteinen remontti", "en": "One-time renovation" }, "intent_codes": ["PROP_RENO"], "sub_context": "linjasaneeraus", "tags": ["rakentaminen"] },
                    { "id": "OPT_HOUSING_CLEAN", "label": { "fi": "Siivouspalvelut", "en": "Cleaning services" }, "intent_codes": ["PROP_CLEANING"], "tags": ["siivous"], "is_service": true },
                    { "id": "OPT_HOUSING_YARD", "label": { "fi": "Pihanhoito / Lumityöt", "en": "Yard care / Snow removal" }, "intent_codes": ["PROP_YARD"], "tags": ["viherrakentaminen", "kiinteistöhuolto"], "is_service": true }
                ]
            },
            {
                "id": "hallinto",
                "question": { "fi": "Hallinnolliset ja asiantuntijatarpeet?", "en": "Administrative and expert needs?" },
                "options": [
                    { "id": "OPT_HOUSING_MANAGEMENT_ADMIN", "label": { "fi": "Isännöintipalvelut", "en": "Property management services" }, "intent_codes": ["PROP_MANAGEMENT"], "tags": ["isännöinti"] },
                    { "id": "OPT_HOUSING_ACCOUNTING", "label": { "fi": "Tilitoimisto / Tilintarkastus", "en": "Accounting / Auditing" }, "intent_codes": ["PROP_ACCOUNTING"], "tags": ["tilitoimisto"] },
                    { "id": "OPT_HOUSING_LEGAL", "label": { "fi": "Lakipalvelut ja sopimusasiat", "en": "Legal services and contracts" }, "intent_codes": ["PROP_LEGAL"], "tags": ["lakiasiaintoimisto", "sopimukset", "lakipalvelut"] }
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
                    { "id": "OPT_FUNERAL_ARRANGEMENTS", "label": { "fi": "Hautajaisjärjestelyt", "en": "Funeral arrangements" }, "intent_codes": ["FUNERAL_ARRANGEMENTS"], "sub_context": "hautauspalvelu", "tags": ["hautauspalvelu"], "node_link": "HAUTAUS", "hide_results": true },
                    { "id": "OPT_FUNERAL_MEMORIAL", "label": { "fi": "Muistotilaisuus", "en": "Memorial service" }, "intent_codes": ["FUNERAL_MEMORIAL"], "sub_context": "muistotilaisuus", "tags": [], "node_link": "HAUTAUS", "hide_results": true },
                    { "id": "OPT_FUNERAL_LEGAL", "label": { "fi": "Perunkirjoitus ja laki-asiat", "en": "Estate inventory and legal matters" }, "intent_codes": ["FUNERAL_LEGAL"], "sub_context": "perunkirjoitus", "tags": ["lakiasiaintoimisto", "perunkirjoitus", "tilitoimisto", "asiantuntijapalvelut", "lakipalvelut"] }
                ]
            },
            {
                "id": "peruspalvelu",
                "question": { "fi": "Hautauspalvelut?", "en": "Funeral services?" },
                "skipIf": "!isSelected('paatarve', 'Hautajaisjärjestelyt')",
                "options": [
                    { "id": "OPT_FUNERAL_SERVICE", "label": { "fi": "Hautauspalvelu ja arkut", "en": "Funeral service and coffins" }, "intent_codes": ["FUNERAL_SERVICE"], "tags": ["hautauspalvelu"] },
                    { "id": "OPT_FUNERAL_STONES", "label": { "fi": "Hautakivet ja kaiverrukset", "en": "Gravestones and engravings" }, "intent_codes": ["FUNERAL_STONES"], "tags": ["hautauspalvelu"] }
                ]
            },
            {
                "id": "kapasiteetti",
                "question": { "fi": "Kuinka paljon henkilöitä muistotilaisuuteen osallistuu?", "en": "How many people will attend the memorial service?" },
                "skipIf": "!isSelected('paatarve', 'Muistotilaisuus')",
                "options": [
                    { "id": "OPT_FUNERAL_CAP_20", "label": { "fi": "Alle 20 henkilöä", "en": "Less than 20 people" }, "capacity_req": 20, "tags": ["juhlatila"] },
                    { "id": "OPT_FUNERAL_CAP_50", "label": { "fi": "Noin 20 - 50 henkilöä", "en": "About 20 - 50 people" }, "capacity_req": 50, "tags": ["juhlatila"] },
                    { "id": "OPT_FUNERAL_CAP_100", "label": { "fi": "Noin 50 - 100 henkilöä", "en": "About 50 - 100 people" }, "capacity_req": 100, "tags": ["juhlatila"] },
                    { "id": "OPT_FUNERAL_CAP_150", "label": { "fi": "Yli 100 henkilöä", "en": "Over 100 people" }, "capacity_req": 150, "tags": ["juhlatila"] },
                    { "id": "OPT_FUNERAL_VENUE_NONE", "label": { "fi": "Omissa tiloissa (ei tilatarvetta)", "en": "At our own premises (no venue needed)" }, "hide_results": true }
                ]
            },
            {
                "id": "muistotilaisuus_lisapalvelut",
                "multiple": true,
                "question": { "fi": "Hautajaisten ja muistotilaisuuden lisäpalvelut?", "en": "Additional services for the funeral and memorial?" },
                "skipIf": "!isSelected('paatarve', 'Muistotilaisuus') && !isSelected('paatarve', 'Hautajaisjärjestelyt')",
                "options": [
                    { "id": "OPT_FUNERAL_CATERING", "label": { "fi": "Kahvitus / Pitopalvelu", "en": "Coffee / Catering" }, "intent_codes": ["BIZ_CATERING"], "tags": ["pitopalvelu"], "profilointi_filter": { "section": "funerals_and_memorials", "field": "memorial_catering", "value": true }, "require_fits_for": { "key": "funerals_and_memorials", "min": 20 } },
                    { "id": "OPT_FUNERAL_FLOWERS", "label": { "fi": "Kukkatervehdykset", "en": "Floral tributes" }, "intent_codes": ["BIZ_FLORIST"], "tags": ["kukkakauppa", "kukat"] },
                    { "id": "OPT_FUNERAL_TRANSPORT", "label": { "fi": "Kuljetuspalvelut", "en": "Transport services" }, "intent_codes": ["BIZ_TRANSPORT"], "tags": ["hautauspalvelu", "kuljetus"], "profilointi_filter": { "section": "funerals_and_memorials", "field": "transport_assistance", "value": true } }
                ]
            },
            {
                "id": "laki_asiat_tarkennus",
                "multiple": true,
                "question": { "fi": "Lakipalvelut ja asiakirjat?", "en": "Legal services and documents?" },
                "skipIf": "!isSelected('paatarve', 'Perunkirjoitus ja laki-asiat')",
                "options": [
                    { "id": "OPT_FUNERAL_LEGAL_INVENTORY", "label": { "fi": "Perunkirjoitus", "en": "Estate inventory", "intent_codes": ["FUNERAL_INVENTORY"] }, "tags": ["lakiasiaintoimisto", "tilitoimisto", "asiantuntijapalvelut", "lakipalvelut"] },
                    { "id": "OPT_FUNERAL_LEGAL_WILL", "label": { "fi": "Testamentti ja edunvalvonta", "en": "Will and guardianship", "intent_codes": ["FUNERAL_WILL"] }, "tags": ["lakiasiaintoimisto", "asiantuntijapalvelut", "lakipalvelut"] },
                    { "id": "OPT_FUNERAL_LEGAL_ADVICE", "label": { "fi": "Lakiasiain neuvonta", "en": "Legal advice", "intent_codes": ["FUNERAL_ADVICE"] }, "tags": ["lakiasiaintoimisto", "konsultointi", "asiantuntijapalvelut", "lakipalvelut"] }
                ]
            },
            {
                "id": "muistot_ja_tallennus",
                "multiple": true,
                "skipIf": "!isSelected('paatarve', 'Muistotilaisuus')",
                "question": { "fi": "Haluaisitko tallentaa muistot tai tarvitsetko digitointipalveluita?", "en": "Would you like to preserve memories or need digitization services?" },
                "options": [
                    { "id": "OPT_FUNERAL_MEM_VIDEO", "label": { "fi": "Videokuvaus / Esitykset", "en": "Video recording / Presentations" }, "intent_codes": ["MEDIA_VIDEO"], "tags": ["videotuotanto", "videokuvaus", "videokuvaaja"], "node_link": "VIDEOTUOTANTO" },
                    { "id": "OPT_FUNERAL_MEM_PHOTO", "label": { "fi": "Valokuvaus", "en": "Photography" }, "intent_codes": ["MEDIA_PHOTO"], "tags": ["valokuvaus", "hautajaiskuvaus"], "profilointi_filter": { "section": "funerals_and_memorials", "field": "refinement_tags", "value": "hautajaiskuvaus" } },
                    { "id": "OPT_FUNERAL_MEM_DIGI", "label": { "fi": "Digitointipalvelut (kuvat, videot ym.)", "en": "Digitization services (photos, videos etc.)" }, "intent_codes": ["MEDIA_DIGITIZATION"], "tags": ["digitointi"], "node_link": "DIGITOINTI" }
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
                    { "id": "OPT_STARTUP_IDEA", "label": { "fi": "Liikeidea & Suunnittelu", "en": "Business idea & Planning" }, "intent_codes": ["STARTUP_IDEA"], "sub_context": "liikeidea", "tags": ["konsultointi"] },
                    { "id": "OPT_STARTUP_REG", "label": { "fi": "Rekisteröinti & Hallinto", "en": "Registration & Administration" }, "intent_codes": ["STARTUP_REG"], "sub_context": "rekisterointi", "tags": ["tilitoimisto"] },
                    { "id": "OPT_STARTUP_MARKETING", "label": { "fi": "Markkinointi & Verkkosivut", "en": "Marketing & Website" }, "intent_codes": ["STARTUP_MARKETING"], "sub_context": "digimarkkinointi", "tags": ["it-palvelut"] }
                ]
            },
            {
                "id": "hallinto",
                "multiple": true,
                "question": { "fi": "Alkuvaiheen hallinto?", "en": "Early-stage administration?" },
                "options": [
                    { "id": "OPT_STARTUP_ADVISORY", "label": { "fi": "Yritysneuvonta / Liiketoimintasuunnitelma", "en": "Business advisory / Business plan" }, "intent_codes": ["STARTUP_ADVISORY"], "tags": ["yritysneuvonta", "konsultointi"], "profilointi_filter": { "section": "startup_services", "field": "business_advisory", "value": true } },
                    { "id": "OPT_STARTUP_ACCOUNTING", "label": { "fi": "Kirjanpito ja tilitoimisto", "en": "Bookkeeping and accounting" }, "intent_codes": ["STARTUP_ACCOUNTING"], "tags": ["tilitoimisto"] },
                    { "id": "OPT_STARTUP_INSURANCE", "label": { "fi": "Vakuutukset", "en": "Insurance" }, "intent_codes": ["STARTUP_INSURANCE"], "tags": ["vakuutus"] },
                    { "id": "OPT_STARTUP_LEGAL", "label": { "fi": "Lakipalvelut", "en": "Legal services" }, "intent_codes": ["STARTUP_LEGAL"], "tags": ["lakiasiaintoimisto", "lakipalvelut"] }
                ]
            },
            {
                "id": "nakyvyys",
                "multiple": true,
                "question": { "fi": "Markkinointi ja näkyvyys?", "en": "Marketing and visibility?" },
                "options": [
                    { "id": "OPT_STARTUP_WEB", "label": { "fi": "Verkkosivut / Domain", "en": "Website / Domain" }, "intent_codes": ["STARTUP_WEB"], "tags": ["verkkosivut", "it-palvelut", "kotisivut"], "profilointi_filter": { "section": "startup_services", "field": "refinement_tags", "value": "verkkosivut" } },
                    { "id": "OPT_STARTUP_BRAND", "label": { "fi": "Logo ja brändäys", "en": "Logo and branding" }, "intent_codes": ["STARTUP_BRAND"], "tags": ["mainostoimisto", "graafiset palvelut", "brändäys"], "profilointi_filter": { "section": "startup_services", "field": "refinement_tags", "value": "brändäys" } },
                    { "id": "OPT_STARTUP_ADS", "label": { "fi": "Somemainonta ja Google-näkyvyys", "en": "Social media ads and Google visibility" }, "intent_codes": ["STARTUP_ADS"], "tags": ["somemainonta", "google-mainonta", "mainostoimisto", "digimarkkinointi"] },
                    { "id": "OPT_STARTUP_PHOTO", "label": { "fi": "Valokuvaus / Yrityskuvat", "en": "Photography / Business photos" }, "intent_codes": ["MEDIA_PHOTO"], "tags": ["valokuvaus", "valokuvaaja"], "profilointi_filter": { "section": "startup_services", "field": "refinement_tags", "value": "yrityskuvat" } }
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
                    { "id": "OPT_GROWTH_MARKETING", "label": { "fi": "Digitaalinen markkinointi & Myynti", "en": "Digital marketing & Sales" }, "intent_codes": ["GROWTH_MARKETING"], "sub_context": "digitaalinen myynti", "tags": ["mainostoimisto"] },
                    { "id": "OPT_GROWTH_STAFF", "label": { "fi": "Henkilöstö & Rekrytointi", "en": "Staff & Recruitment" }, "intent_codes": ["GROWTH_STAFF"], "sub_context": "rekrytointi", "tags": ["henkilöstöpalvelut"] },
                    { "id": "OPT_GROWTH_CONSULT", "label": { "fi": "Liikkeenjohdon konsultointi", "en": "Management consulting" }, "intent_codes": ["GROWTH_CONSULT"], "sub_context": "konsultointi", "tags": ["konsultointi"] }
                ]
            },
            {
                "id": "myynti",
                "multiple": true,
                "question": { "fi": "Lisää myyntiä ja tunnettuutta?", "en": "More sales and visibility?" },
                "options": [
                    { "id": "OPT_GROWTH_SEO", "label": { "fi": "Google-mainonta / SEO", "en": "Google ads / SEO" }, "intent_codes": ["GROWTH_SEO"], "tags": ["google-mainonta", "mainostoimisto"] },
                    { "id": "OPT_GROWTH_SOCIAL", "label": { "fi": "Sosiaalisen median markkinointi", "en": "Social media marketing" }, "intent_codes": ["GROWTH_SOCIAL"], "tags": ["somemainonta", "mainostoimisto"] },
                    { "id": "OPT_GROWTH_ECOMMERCE", "label": { "fi": "Verkkokaupan rakentaminen", "en": "Building an online store" }, "intent_codes": ["GROWTH_ECOMMERCE"], "tags": ["verkkokauppa", "it-palvelut"] },
                    { "id": "OPT_GROWTH_VIDEO", "label": { "fi": "Videotuotanto / Mainosvideot", "en": "Video production / Advertising videos" }, "intent_codes": ["MEDIA_VIDEO"], "tags": ["videotuotanto", "videomarkkinointi", "video"], "profilointi_filter": { "section": "business_growth", "field": "refinement_tags", "value": "videomarkkinointi" } }
                ]
            },
            {
                "id": "henkilosto",
                "multiple": true,
                "question": { "fi": "Resurssit ja osaaminen?", "en": "Resources and expertise?" },
                "options": [
                    { "id": "OPT_GROWTH_RECRUIT", "label": { "fi": "Rekyktointipalvelut", "en": "Recruitment services" }, "intent_codes": ["GROWTH_RECRUIT"], "tags": ["henkilöstöpalvelut"] },
                    { "id": "OPT_GROWTH_TRAINING", "label": { "fi": "Henkilöstön koulutus", "en": "Staff training" }, "intent_codes": ["GROWTH_TRAINING"], "tags": ["koulutus"] },
                    { "id": "OPT_GROWTH_MANAGEMENT", "label": { "fi": "Liikkeenjohdon konsultointi", "en": "Management consulting" }, "intent_codes": ["GROWTH_CONSULT"], "tags": ["konsultointi"] }
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
                    { "id": "OPT_PARTNER_IT", "label": { "fi": "IT- ja tietotekniikka", "en": "IT and computing", "intent_codes": ["PARTNER_IT"] }, "tags": ["it-palvelut", "vakiopalvelu"] },
                    { "id": "OPT_PARTNER_CLEAN", "label": { "fi": "Siivous ja kiinteistöhuolto", "en": "Cleaning and property maintenance", "intent_codes": ["PARTNER_CLEAN"] }, "tags": ["siivous", "kiinteistöhuolto", "vakiopalvelu"] },
                    { "id": "OPT_PARTNER_ACCOUNTING", "label": { "fi": "Kirjanpito ja taloushallinto", "en": "Accounting and financial management", "intent_codes": ["PARTNER_ACCOUNTING"] }, "tags": ["tilitoimisto"] },
                    { "id": "OPT_PARTNER_MARKETING", "label": { "fi": "Markkinointikumppani", "en": "Marketing partner", "intent_codes": ["PARTNER_MARKETING"] }, "tags": ["mainostoimisto", "vakiopalvelu"] }
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
                    { "id": "OPT_EMERGENCY_HVAC", "label": { "fi": "LVI- tai putkipäivystys", "en": "HVAC or plumbing emergency", "intent_codes": ["EMERGENCY_HVAC"] }, "tags": ["LVI", "päivystys"], "profilointi_filter": { "section": "construction_and_maintenance", "field": "emergency_service", "value": true } },
                    { "id": "OPT_EMERGENCY_ELECTRIC", "label": { "fi": "Sähköpäivystys", "en": "Electrical emergency", "intent_codes": ["EMERGENCY_ELECTRIC"] }, "tags": ["sähköasennukset", "päivystys"], "profilointi_filter": { "section": "construction_and_maintenance", "field": "emergency_service", "value": true } },
                    { "id": "OPT_EMERGENCY_TOWING", "label": { "fi": "Hinaus ja tiepalvelu", "en": "Towing and roadside assistance", "intent_codes": ["EMERGENCY_TOWING"] }, "tags": ["hinaus"] },
                    { "id": "OPT_EMERGENCY_LOCKSMITH", "label": { "fi": "Lukkoseppä (avaimet hukkuneet)", "en": "Locksmith (locked out)", "intent_codes": ["EMERGENCY_LOCKSMITH"] }, "tags": ["lukkoseppä", "päivystys"] }
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
                    { "id": "OPT_WELLBEING_MASSAGE", "label": { "fi": "Hieronnat & Kehonhuolto", "en": "Massage & Body care", "intent_codes": ["WELLBEING_MASSAGE"] }, "sub_context": "hieronta", "tags": ["hieronta"], "is_service": true },
                    { "id": "OPT_WELLBEING_BEAUTY", "label": { "fi": "Kauneudenhoito & Kampaamot", "en": "Beauty care & Hairdressers", "intent_codes": ["WELLBEING_BEAUTY"] }, "sub_context": "kauneudenhoito", "tags": ["kampaamo", "kauneus"], "is_service": true },
                    { "id": "OPT_WELLBEING_HEALTH", "label": { "fi": "Terveyspalvelut", "en": "Health services", "intent_codes": ["WELLBEING_HEALTH"] }, "sub_context": "terveyspalvelut", "tags": ["terveyspalvelut"], "is_service": true },
                    { "id": "OPT_WELLBEING_THERAPY", "label": { "fi": "Mielen hyvinvointi & Terapia", "en": "Mental wellbeing & Therapy", "intent_codes": ["WELLBEING_THERAPY"] }, "sub_context": "terapia", "tags": ["psykologi"], "is_service": true },
                    { "id": "OPT_WELLBEING_CARE", "label": { "fi": "Hoivapalvelu ja kotihoito", "en": "Care services and home care", "intent_codes": ["WELLBEING_CARE"] }, "sub_context": "kotihoito", "tags": ["kotihoito"], "is_service": true }
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
                    { "id": "OPT_REC_SWIMMING", "label": { "fi": "Uinti", "en": "Swimming" }, "tags": ["uinti", "uimahalli", "kylpylä", "peurunka", "vesiliikunta", "avantouinti"], "intent_codes": ["REC_SWIMMING"] },
                    { "id": "OPT_REC_RAFTING", "label": { "fi": "Koskenlasku", "en": "White-water rafting" }, "tags": ["koskenlasku", "vesiaktiviteetit", "melonta", "varjola", "koskimelonta"], "intent_codes": ["REC_RAFTING"] },
                    { "id": "OPT_REC_GOLF", "label": { "fi": "Golf", "en": "Golf" }, "tags": ["golf", "golfkenttä", "golfklubi", "revontuli", "ulkoilu"], "intent_codes": ["REC_GOLF"] },
                    { "id": "OPT_REC_RIDING", "label": { "fi": "Ratsastus", "en": "Horse riding" }, "tags": ["ratsastus", "hevonen", "ratsastuskoulu", "vaellus hevosella"], "intent_codes": ["REC_RIDING"] },
                    { "id": "OPT_REC_AMUSEMENT", "label": { "fi": "Huvipuisto", "en": "Amusement park" }, "tags": ["lapset", "huvipuisto", "nokkakivi", "elämyspalvelut", "perheaktiviteetit"], "intent_codes": ["REC_AMUSEMENT"] },
                    { "id": "OPT_REC_OUTDOOR", "label": { "fi": "Luontoretkeily", "en": "Nature hiking" }, "tags": ["retkeily", "luontoretkeily", "luonto", "multamäki", "vaellus", "eräopas", "ohjelmapalvelut"], "intent_codes": ["REC_OUTDOOR"] },
                    { "id": "OPT_REC_GYM", "label": { "fi": "Kuntosali", "en": "Gym" }, "tags": ["kuntosali", "liikuntakeskus", "ohjattu liikunta", "personal trainer", "ryhmäliikunta"], "intent_codes": ["REC_GYM"] }
                ]
            }
        ]
    },
    "elaimet": {
        "title": { "fi": "Eläimet ja lemmikit", "en": "Animals and Pets" },
        "icon": "🐾",
        "description": { "fi": "Löydä eläinlääkärit, trimmaajat ja muut lemmikkipalvelut.", "en": "Find veterinarians, groomers and other pet services." },
        "profilointi_context": "animals",
        "steps": [
            {
                "id": "tarve",
                "multiple": true,
                "question": { "fi": "Mitä lemmikkisi tarvitsee?", "en": "What does your pet need?" },
                "options": [
                    { "id": "OPT_PETS_VET", "label": { "fi": "Eläinlääkäri", "en": "Veterinarian" }, "sub_context": "elainlaakari", "tags": ["eläinlääkäri"], "intent_codes": ["PETS_VET"] },
                    { "id": "OPT_PETS_SUPPLIES", "label": { "fi": "Lemmikkitarvikkeet / Ruoka", "en": "Pet supplies / Food" }, "sub_context": "elaintarvikkeet", "tags": ["lemmikkitarvikkeet"], "intent_codes": ["PETS_SUPPLIES"] },
                    { "id": "OPT_PETS_GROOMING", "label": { "fi": "Trimmaus / Pesu", "en": "Grooming / Washing" }, "sub_context": "trimmaus", "tags": ["trimmaus"], "intent_codes": ["PETS_GROOMING"] },
                    { "id": "OPT_PETS_CARE", "label": { "fi": "Koulutus / Hoito", "en": "Training / Care" }, "sub_context": "elainhoitola", "tags": ["koirahoitola", "eläinkoulutus"], "intent_codes": ["PETS_CARE"] }
                ]
            },
            {
                "id": "elainlaji",
                "question": { "fi": "Minkä eläimen palveluita etsit?", "en": "Which animal's services are you looking for?" },
                "options": [
                    { "id": "OPT_PETS_DOG", "label": { "fi": "Koira", "en": "Dog" }, "tags": ["koira"], "intent_codes": ["PETS_DOG"] },
                    { "id": "OPT_PETS_CAT", "label": { "fi": "Kissa", "en": "Cat" }, "tags": ["kissa"], "intent_codes": ["PETS_CAT"] },
                    { "id": "OPT_PETS_HORSE", "label": { "fi": "Hevonen", "en": "Horse" }, "tags": ["hevonen"], "intent_codes": ["PETS_HORSE"] },
                    { "id": "OPT_PETS_SMALL", "label": { "fi": "Pieneläimet", "en": "Small animals" }, "tags": ["pieneläin"], "intent_codes": ["PETS_SMALL"] }
                ]
            }
        ]
    },
    "lapset-ja-perhe": {
        "title": { "fi": "Lapset ja perhe", "en": "Children and Family" },
        "icon": "👨‍👩‍👧‍👦",
        "description": { "fi": "Etsi lapsiperheille sopivia aktiviteetteja ja palveluita.", "en": "Find activities and services for families with children." },
        "profilointi_context": "family-and-children",
        "steps": [
            {
                "id": "palvelut",
                "multiple": true,
                "question": { "fi": "Millaista palvelua etsitte?", "en": "What kind of service are you looking for?" },
                "options": [
                    { "id": "OPT_FAMILY_EDU", "label": { "fi": "Päivähoito / Koulutus", "en": "Daycare / Education" }, "sub_context": "paivahoito", "tags": ["päiväkoti", "koulutus"], "intent_codes": ["EDU_DAYCARE"] },
                    { "id": "OPT_FAMILY_HOBBY", "label": { "fi": "Harrastukset lapsille", "en": "Hobbies for children" }, "sub_context": "lasten harrastukset", "tags": ["lapset", "harrastukset"], "intent_codes": ["REC_CHILDREN"] },
                    { "id": "OPT_FAMILY_SHOP", "label": { "fi": "Lastentarvikkeet", "en": "Children's supplies" }, "sub_context": "lastentarvikkeet", "tags": ["erikoisliikkeet", "lapset"], "intent_codes": ["SHOP_CHILDREN"] },
                    { "id": "OPT_FAMILY_SUPPORT", "label": { "fi": "Perheterapia / Tuki", "en": "Family therapy / Support" }, "sub_context": "perhetuki", "tags": ["psykologi", "perhepalvelut"], "intent_codes": ["WELLBEING_FAMILY"] }
                ]
            },
            {
                "id": "ika",
                "question": { "fi": "Minkä ikäisistä lapsista on kyse?", "en": "What age are the children?" },
                "options": [
                    { "id": "OPT_FAMILY_AGE_03", "label": { "fi": "Vauvat ja taaperot (0-3v)", "en": "Babies and toddlers (0-3y)" }, "tags": ["vauva"], "intent_codes": ["FAMILY_INFANT"] },
                    { "id": "OPT_FAMILY_AGE_36", "label": { "fi": "Leikki-ikäiset (3-6v)", "en": "Preschoolers (3-6y)" }, "tags": ["lapset"], "intent_codes": ["FAMILY_PRESCHOOL"] },
                    { "id": "OPT_FAMILY_AGE_SCHOOL", "label": { "fi": "Koululaiset", "en": "School-age children" }, "tags": ["koululainen"], "intent_codes": ["FAMILY_SCHOOL"] },
                    { "id": "OPT_FAMILY_AGE_TEENS", "label": { "fi": "Nuoret / Teinit", "en": "Youth / Teens" }, "tags": ["nuoret"], "intent_codes": ["FAMILY_TEEN"] }
                ]
            }
        ]
    },
    "autohuollot": {
        "title": { "fi": "Autohuollot", "en": "Car Maintenance" },
        "icon": "🚗",
        "description": { "fi": "Etsi luotettava korjaamo tai huoltopalvelu autollesi.", "en": "Find a reliable repair shop or maintenance service for your car." },
        "profilointi_context": "auto_services",
        "steps": [
            {
                "id": "palvelut",
                "multiple": true,
                "question": { "fi": "Millaista palvelua autoosi tarvitset?", "en": "What kind of service does your car need?" },
                "options": [
                    { "id": "OPT_AUTO_REPAIR", "label": { "fi": "Perushuolto ja korjaukset", "en": "Basic maintenance and repairs" }, "sub_context": "autokorjaamo", "tags": ["autokorjaamot", "autohuolto"], "intent_codes": ["AUTO_REPAIR"] },
                    { "id": "OPT_AUTO_TIRES", "label": { "fi": "Renkaiden vaihto tai osto", "en": "Tire change or purchase" }, "sub_context": "rengasliike", "tags": ["rengasliike"], "intent_codes": ["AUTO_TIRES"] },
                    { "id": "OPT_AUTO_WASH", "label": { "fi": "Auton pesu tai hoito", "en": "Car wash or care" }, "sub_context": "autopesu", "tags": ["autopesu", "automaalaamo"], "intent_codes": ["AUTO_WASH"] },
                    { "id": "OPT_AUTO_HEAVY", "label": { "fi": "Raskaan kaluston huolto", "en": "Heavy equipment maintenance" }, "sub_context": "raskaskonehuolto", "tags": ["raskaskonehuolto"], "intent_codes": ["AUTO_HEAVY"] }
                ]
            }
        ]
    },
    "vuokraus": {
        "title": { "fi": "Vuokrauspalvelut", "en": "Rental Services" },
        "icon": "🔑",
        "description": { "fi": "Vuokraa kalustoa ja laitteita tarpeen mukaan.", "en": "Rent equipment and machinery as needed." },
        "profilointi_context": "events_and_celebrations",
        "steps": [
            {
                "id": "tyyppi",
                "multiple": true,
                "question": { "fi": "Mitä olet vuokraamassa?", "en": "What are you renting?" },
                "options": [
                    {
                        "id": "OPT_RENTAL_DISH",
                        "label": { "fi": "Astiavuokraus (lautaset, lasit, aterimet)", "en": "Tableware rental (plates, glasses, cutlery)" },
                        "intent_codes": ["BIZ_CATERING", "EVT_WEDDING", "EVT_CORPORATE"],
                        "capability_requirements": [{ "code": "DISH_RENTAL" }]
                    },
                    {
                        "id": "OPT_RENTAL_AV",
                        "label": { "fi": "AV-laitteiden vuokraus (äänentoisto, valot, näytöt)", "en": "AV equipment rental (sound, lights, screens)" },
                        "intent_codes": ["EVT_CORPORATE", "EVT_WEDDING", "VENUE_MEETING"],
                        "capability_requirements": [{ "code": "AV_RENTAL" }]
                    },
                    {
                        "id": "OPT_RENTAL_FATBIKE",
                        "label": { "fi": "Fatbike vuokraus", "en": "Fatbike rental" },
                        "intent_codes": ["REC_OUTDOOR", "FATBIKE_RENTAL"],
                        "capability_requirements": [{ "code": "FATBIKE_RENTAL" }]
                    },
                    {
                        "id": "OPT_RENTAL_CANOE",
                        "label": { "fi": "Kanootin tai kajakin vuokraus", "en": "Canoe or kayak rental" },
                        "intent_codes": ["REC_OUTDOOR", "REC_RAFTING", "WATER_SPORT_RENTAL"],
                        "capability_requirements": [{ "code": "CANOE_RENTAL" }]
                    },
                    {
                        "id": "OPT_RENTAL_TRAILER",
                        "label": { "fi": "Peräkärryn vuokraus", "en": "Trailer rental" },
                        "intent_codes": ["HOME_MOVING", "MOVE_TRANSPORT"],
                        "capability_requirements": [{ "code": "TRAILER_RENTAL" }]
                    },
                    {
                        "id": "OPT_RENTAL_BICYCLE",
                        "label": { "fi": "Polkupyörän vuokraus (maastopyörä, kaupunkipyörä, fatbike)", "en": "Bicycle rental (mountain bike, city bike, fatbike)" },
                        "capability_requirements": [
                            { "code": "BICYCLE_RENTAL", "min_priority": 0.7 },
                            { "code": "OUTDOOR_RENTAL" }
                        ]
                    },
                    {
                        "id": "OPT_RENTAL_EQUIPMENT",
                        "label": { "fi": "Rakennuskoneen tai muun laitteen vuokraus", "en": "Construction machine or other equipment rental" },
                        "intent_codes": ["HOME_MAINTENANCE", "RENO_RENTAL", "HOME_RENOVATION"],
                        "capability_requirements": [{ "code": "EQUIPMENT_RENTAL" }]
                    },
                    {
                        "id": "OPT_RENTAL_SAUNA",
                        "label": { "fi": "Saunan vuokraus (saunailta, savusauna)", "en": "Sauna rental (sauna evening, smoke sauna)" },
                        "intent_codes": ["WELLBEING_BEAUTY", "REC_OUTDOOR", "HOME_COTTAGE"],
                        "capability_requirements": [{ "code": "SAUNA_FACILITY" }]
                    },
                    {
                        "id": "OPT_RENTAL_SUP",
                        "label": { "fi": "SUP-laudan vuokraus", "en": "SUP board rental" },
                        "intent_codes": ["REC_OUTDOOR", "REC_SWIMMING", "WATER_SPORT_RENTAL"],
                        "capability_requirements": [{ "code": "SUP_RENTAL" }]
                    },
                    {
                        "id": "OPT_RENTAL_TENT",
                        "label": { "fi": "Teltta- ja katosvuokraus (juhlateltta, markiisi)", "en": "Tent and canopy rental (party tent, marquee)" },
                        "intent_codes": ["EVT_WEDDING", "VENUE_PARTY", "EVT_CORPORATE"],
                        "capability_requirements": [{ "code": "TENT_RENTAL" }]
                    },
                    {
                        "id": "OPT_RENTAL_BOAT",
                        "label": { "fi": "Venevuokraus", "en": "Boat rental" },
                        "intent_codes": ["REC_OUTDOOR", "WATER_SPORT_RENTAL"],
                        "capability_requirements": [{ "code": "WATERCRAFT_RENTAL" }]
                    }
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
