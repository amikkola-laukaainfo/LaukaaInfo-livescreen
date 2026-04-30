const NEEDS_CONFIG = {
    "haat": {
        "title": "Häät",
        "icon": "💒",
        "description": "Suunnittele unelmiesi häät Laukaassa. Löydä tilat, tarjoilut ja elämykset.",
        "profilointi_context": "events_and_celebrations",
        "steps": [
            {
                "id": "tarkennus",
                "hide_results": true,
                "question": "Millaista hääjuhlaa suunnittelette?",
                "options": [
                    { "label": "Perinteiset häät", "sub_context": "perinteiset häät", "tags": ["häät"] },
                    { "label": "Pienet häät / Intiimi juhla", "sub_context": "pienet häät", "tags": ["häät"] },
                    { "label": "Teemahäät / Modernit häät", "sub_context": "teemahäät", "tags": ["häät"] },
                    { "label": "Vain vihkiminen ja kahvitus", "sub_context": "vihkiminen", "tags": ["häät"] }
                ]
            },
            {
                "id": "kapasiteetti",
                "question": "Kuinka paljon henkilöitä tilaisuuteen osallistuu (arvio)?",
                "options": [
                    { "label": "Alle 20 henkilöä", "capacity_req": 20, "tags": [] },
                    { "label": "Noin 20 - 50 henkilöä", "capacity_req": 50, "tags": [] },
                    { "label": "Noin 50 - 100 henkilöä", "capacity_req": 100, "tags": [] },
                    { "label": "Yli 100 henkilöä", "capacity_req": 150, "tags": [] }
                ]
            },
            {
                "id": "tila",
                "question": "Millaista juhlatilaa etsit?",
                "options": [
                    { "label": "Juhlatila (iso)", "tags": ["juhlatila"], "capacity_req": 100, "node_link": "ROLE_VENUE" },
                    { "label": "Tunnelmallinen kartano", "tags": ["kartano", "juhlatila"], "capacity_req": 50, "node_link": "ROLE_VENUE" },
                    { "label": "Luonnonläheinen tila", "tags": ["luonto", "juhlatila"], "capacity_req": 30, "node_link": "ROLE_VENUE", "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "ranta" } }
                ]
            },
            {
                "id": "palvelut",
                "multiple": true,
                "question": "Mitä palveluita tarvitset juhlapäivään?",
                "options": [
                    { "label": "Pitopalvelu", "tags": ["pitopalvelu"] },
                    { "label": "Valokuvaaja", "tags": ["valokuvaus", "valokuvaaja"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "hääkuvaus" } },
                    { "label": "Videokuvaaja", "tags": ["videotuotanto", "videokuvaus", "videokuvaaja"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "häävideo" } },
                    { "label": "Kukkakauppa & Koristelu", "tags": ["kukkakauppa"] },
                    { "label": "Musiikki tai DJ", "tags": ["musiikki", "ohjelmapalvelut"], "profilointi_filter": { "section": "events_and_celebrations", "field": "entertainment_features", "value": "live-musiikki" } }
                ]
            },
            {
                "id": "vieraat",
                "multiple": true,
                "question": "Tarpeet vieraiden mukavuuteen?",
                "skipIf": "getSelectedCompanyProfilointi('tila', 'events_and_celebrations', 'accommodation_available')",
                "skipMessage": "Valitsemassasi tilassa majoitus sisältyy pakettiin — ei tarvetta erikseen.",
                "options": [
                    { "label": "Majoitus vieraille", "tags": ["majoitus"] },
                    { "label": "Kuljetus / Bussi / Taksi", "tags": ["taksi", "kuljetus"] },
                    { "label": "Kauneuspalvelut / Meikki", "tags": ["kauneus", "kampaamo"] }
                ]
            },
            {
                "id": "tallennus_ja_muistot",
                "multiple": true,
                "question": "Haluaisitko ikuistaa päivän digitaalisesti tai tarvitsetko muita digitointipalveluita?",
                "options": [
                    { "label": "Häävideon editointi / Koostepalvelu", "tags": ["videotuotanto"], "node_link": "ROLE_DIGITIZATION", "profilointi_filter": { "section": "events_and_celebrations", "field": "digitization_features", "value": "häävideoiden editointi" } },
                    { "label": "Drone-kuvaus", "tags": ["drone"], "node_link": "ROLE_DIGITIZATION", "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "drone-kuvaus" } },
                    { "label": "Digitointipalvelut (kuvat, videot ym.)", "tags": ["digitointi"], "node_link": "ROLE_DIGITIZATION" }
                ]
            },
            {
                "id": "digitoinnin_tarkennus",
                "multiple": true,
                "question": "Mitä haluaisit digitoida juhlaesitystä varten?",
                "skipIf": "!isSelected('tallennus_ja_muistot', 'digitointi')",
                "options": [
                    { "label": "Vanhojen valokuvien digitointi", "tags": ["digitointi"], "profilointi_filter": { "section": "events_and_celebrations", "field": "digitization_features", "value": "vanhojen valokuvien digitointi" } },
                    { "label": "VHS- tai DVD-materiaalin digitointi", "tags": ["digitointi"], "profilointi_filter": { "section": "events_and_celebrations", "field": "digitization_features", "value": "VHS / DVD digitointi" } },
                    { "label": "Diojen, negatiivien tai kaitafilmien digitointi", "tags": ["digitointi"], "profilointi_filter": { "section": "events_and_celebrations", "field": "digitization_features", "value": "diojen, negatiivien ja kaitafilmien digitointi" } }
                ]
            }
        ]
    },
    "yritysjuhlat": {
        "title": "Yritysjuhlat",
        "icon": "🥂",
        "description": "Järjestä onnistuneet henkilöstöjuhlat, pikkujoulut tai asiakastilaisuudet.",
        "profilointi_context": "events_and_celebrations",
        "steps": [
            {
                "id": "tarkennus",
                "question": "Millaista tilaisuutta olet järjestämässä?",
                "options": [
                    { "label": "Pikkujoulut", "sub_context": "pikkujoulut", "tags": ["juhlatila"], "capacity_req": 30 },
                    { "label": "Henkilöstöjuhlat / Kesäjuhlat", "sub_context": "henkilöstöjuhlat", "tags": ["juhlatila"], "capacity_req": 50 },
                    { "label": "Virkistyspäivä / Tyky-päivä", "sub_context": "tyky-paiva", "tags": ["ohjelmapalvelut"] },
                    { "label": "Asiakastilaisuus / Edustus", "sub_context": "edustustilaisuus", "tags": ["edustustila"], "capacity_req": 20 }
                ]
            },
            {
                "id": "kapasiteetti",
                "question": "Kuinka paljon henkilöitä tilaisuuteen osallistuu (arvio)?",
                "options": [
                    { "label": "Alle 20 henkilöä", "capacity_req": 20, "tags": [] },
                    { "label": "Noin 20 - 50 henkilöä", "capacity_req": 50, "tags": [] },
                    { "label": "Noin 50 - 100 henkilöä", "capacity_req": 100, "tags": [] },
                    { "label": "Yli 100 henkilöä", "capacity_req": 150, "tags": [] }
                ]
            },
            {
                "id": "palvelut",
                "multiple": true,
                "question": "Mitä lisäpalveluita tarvitsette?",
                "options": [
                    { "label": "Pitopalvelu", "tags": ["pitopalvelu"] },
                    { "label": "Majoitus", "tags": ["majoitus"] },
                    { "label": "Kuljetukset", "tags": ["kuljetus", "taksi"] },
                    { "label": "Videokuvaaja / Tapahtumavideointi", "tags": ["videotuotanto", "videokuvaus"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "videotuotanto" } },
                    { "label": "Saunatilat", "tags": ["saunatilat"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "sauna" } },
                    { "label": "Ohjelmapalvelut / Elämykset", "tags": ["ohjelmapalvelut"] },
                    { "label": "AV-tekniikka & Äänentoisto", "tags": ["it-palvelut"], "profilointi_filter": { "section": "events_and_celebrations", "field": "has_av_tech", "value": true } }
                ]
            },
            {
                "id": "hyvinvointi",
                "multiple": true,
                "question": "Tarvitsetteko hyvinvointia tai ohjelmaa tyky-päivään?",
                "options": [
                    { "label": "Yrityshyvinvointi / Luennot", "tags": ["hyvinvointi"] },
                    { "label": "Ohjattu liikunta / Jooga", "tags": ["liikunta"] },
                    { "label": "Luontoelämykset / Eräopas", "tags": ["ohjelmapalvelut"] }
                ]
            }
        ]
    },
    "yritystilaisuudet": {
        "title": "Yritystilaisuudet",
        "icon": "💼",
        "description": "Kokoukset, seminaarit ja koulutukset ammattimaisessa ympäristössä.",
        "profilointi_context": "business_events",
        "steps": [
            {
                "id": "tarkennus",
                "question": "Millaista tilaa tarvitsette?",
                "options": [
                    { "label": "Pieni kokous / Neuvottelu", "sub_context": "kokous", "tags": ["kokoustilat"] },
                    { "label": "Seminaari / Koulutus", "sub_context": "seminaari", "tags": ["seminaaritilat"] },
                    { "label": "Konferenssi / Suuri tilaisuus", "sub_context": "konferenssi", "tags": ["kokoustilat"] },
                    { "label": "Edustus- tai saunakokous", "sub_context": "edustuskokous", "tags": ["edustustila", "saunatilat"] }
                ]
            },
            {
                "id": "kapasiteetti",
                "question": "Kuinka paljon henkilöitä tilaisuuteen osallistuu (arvio)?",
                "options": [
                    { "label": "Alle 20 henkilöä", "capacity_req": 20, "tags": [] },
                    { "label": "Noin 20 - 50 henkilöä", "capacity_req": 50, "tags": [] },
                    { "label": "Noin 50 - 100 henkilöä", "capacity_req": 100, "tags": [] },
                    { "label": "Yli 100 henkilöä", "capacity_req": 150, "tags": [] }
                ]
            },
            {
                "id": "tarjoilu",
                "question": "Tarjoilut tilaisuuteen?",
                "options": [
                    { "label": "Lounas ja kahvitus", "tags": ["ravintola", "pitopalvelu"] },
                    { "label": "Illallinen", "tags": ["ravintola"] },
                    { "label": "Vain tilat", "tags": [] }
                ]
            },
            {
                "id": "lisat",
                "multiple": true,
                "question": "Muut tarpeet?",
                "options": [
                    { "label": "Majoitus", "tags": ["majoitus"] },
                    { "label": "Videokuvaaja / Tapahtumavideointi", "tags": ["videotuotanto", "videokuvaus", "videokuvaaja"], "profilointi_filter": { "section": "business_events", "field": "refinement_tags", "value": "yritysvideot" } },
                    { "label": "Yrityslahjat", "tags": ["yrityslahjat", "lahjatavarat"] },
                    { "label": "IT-tuki / AV-tekniikka", "tags": ["it-palvelut"], "profilointi_filter": { "section": "business_events", "field": "has_projector", "value": true } }
                ]
            }
        ]
    },
    "syntymapaivat": {
        "title": "Syntymäpäivät",
        "icon": "🎂",
        "description": "Järjestä ikimuistoiset syntymäpäivät kaikenikäisille.",
        "profilointi_context": "events_and_celebrations",
        "steps": [
            {
                "id": "tarkennus",
                "question": "Kenen juhlia järjestetään?",
                "options": [
                    { "label": "Lasten syntymäpäivät", "sub_context": "lasten synttärit", "tags": ["lapset"] },
                    { "label": "Nuorten / Aikuisten juhlat", "sub_context": "aikuisten synttärit", "tags": ["juhlatila"] },
                    { "label": "Pyöreät vuodet / Sukujuhlat", "sub_context": "sukujuhlat", "tags": ["juhlatila", "kartano"] }
                ]
            },
            {
                "id": "kapasiteetti",
                "question": "Kuinka paljon henkilöitä tilaisuuteen osallistuu (arvio)?",
                "options": [
                    { "label": "Alle 20 henkilöä", "capacity_req": 20, "tags": [] },
                    { "label": "Noin 20 - 50 henkilöä", "capacity_req": 50, "tags": [] },
                    { "label": "Noin 50 - 100 henkilöä", "capacity_req": 100, "tags": [] },
                    { "label": "Yli 100 henkilöä", "capacity_req": 150, "tags": [] }
                ]
            },
            {
                "id": "tila",
                "question": "Missä haluat juhlia?",
                "options": [
                    { "label": "Ravintolassa valmiissa pöydässä", "tags": ["ravintola"], "capacity_req": 10 },
                    { "label": "Vuokratussa juhlatilassa", "tags": ["juhlatila"], "capacity_req": 30 },
                    { "label": "Kotona (tarvitaan palveluita)", "tags": ["pitopalvelu"] },
                    { "label": "Saunalla tai mökillä", "tags": ["saunatilat", "majoitus"], "capacity_req": 10 }
                ]
            },
            {
                "id": "palvelut",
                "multiple": true,
                "question": "Mitä tarvitaan onnistuneisiin juhliin?",
                "options": [
                    { "label": "Pitopalvelu / Ruoat", "tags": ["pitopalvelu"] },
                    { "label": "Kakut / Leivonnaiset", "tags": ["leipomo", "elintarvike"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "hääkakku" } },
                    { "label": "Ohjelma / Esiintyjä", "tags": ["ohjelmapalvelut"] },
                    { "label": "Valokuvaus", "tags": ["valokuvaus"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "juhlakuvaus" } },
                    { "label": "Videokuvaus", "tags": ["videotuotanto", "videokuvaus"], "profilointi_filter": { "section": "events_and_celebrations", "field": "refinement_tags", "value": "juhlakuvaus" } },
                    { "label": "Kukat", "tags": ["kukkakauppa"] }
                ]
            }
        ]
    },
    "muutto": {
        "title": "Muutto",
        "icon": "📦",
        "description": "Muuttoauto, kantajat, pakkaus ja loppusiivous helposti.",
        "profilointi_context": "moving_and_housing",
        "steps": [
            {
                "id": "tarkennus",
                "question": "Millaista muuttoapua tarvitset?",
                "options": [
                    { "label": "Kodin muutto", "sub_context": "kodin muutto", "tags": ["muuttopalvelu"] },
                    { "label": "Yritysmuutto", "sub_context": "yritysmuutto", "tags": ["muuttopalvelu"] },
                    { "label": "Pieni kuljetus / Peräkärry", "sub_context": "pienmuutto", "tags": ["kuljetus"] }
                ]
            },
            {
                "id": "muuttoapu",
                "question": "Millaista apua tarvitset muuttoon?",
                "options": [
                    { "label": "Muuttopalvelu (auto + kantajat)", "tags": ["kuljetusliike", "muuttopalvelu"] },
                    { "label": "Vain kuljetus / Peräkärry", "tags": ["kuljetus", "hinaus"] },
                    { "label": "Varastointipalvelu", "tags": ["varastointi"] }
                ]
            },
            {
                "id": "asunto",
                "multiple": true,
                "question": "Uuden kodin valmistelu?",
                "options": [
                    { "label": "Muuttosiivous", "tags": ["siivous", "puhdistuspalvelut"] },
                    { "label": "Sähkösopimus / Sähköasennukset", "tags": ["sähköasennukset"] },
                    { "label": "Pieni pintaremontti", "tags": ["maalaustyöt", "rakentaminen"] }
                ]
            }
        ]
    },
    "remontti": {
        "title": "Remontti",
        "icon": "🔨",
        "description": "Löydä tekijät ja tarvikkeet kodin tai toimitilan uudistukseen.",
        "profilointi_context": "construction_and_maintenance",
        "steps": [
            {
                "id": "tarkennus",
                "question": "Mitä olet remontoimassa?",
                "options": [
                    { "label": "Kylpyhuoneremontti", "sub_context": "kylpyhuoneremontti", "tags": ["LVI", "rakentaminen"] },
                    { "label": "Keittiöremontti", "sub_context": "keittiöremontti", "tags": ["rakentaminen"] },
                    { "label": "Pintaremontti (maalaus tms.)", "sub_context": "pintaremontti", "tags": ["maalaustyöt"] },
                    { "label": "Uudisrakentaminen", "sub_context": "uudisrakentaminen", "tags": ["rakentaminen"] }
                ]
            },
            {
                "id": "tekijat",
                "multiple": true,
                "question": "Millaista ammattilaista etsit?",
                "options": [
                    { "label": "Rakennus- / Remonttimies", "tags": ["rakentaminen", "rakennustyöt"] },
                    { "label": "Sähköasentaja", "tags": ["sähköasennukset"] },
                    { "label": "LVI-asentaja (Putkimies)", "tags": ["LVI"] },
                    { "label": "Maalari / Tapetoija", "tags": ["maalaustyöt"] },
                    { "label": "Suunnittelija / Arkkitehti", "tags": ["suunnittelutoimisto"] }
                ]
            },
            {
                "id": "tarvikkeet",
                "question": "Mistä hankit materiaalit?",
                "options": [
                    { "label": "Rautakauppa / Rakennustarvikkeet", "tags": ["rautakauppa", "rakennustarvikkeet"] },
                    { "label": "Koneiden ja laitteiden vuokraus", "tags": ["rakennuskonevuokraus"] },
                    { "label": "Sisustustuotteet", "tags": ["kaupat ja ostokset", "erikoisliikkeet"] }
                ]
            }
        ]
    },
    "mokkipalvelut": {
        "title": "Mökkipalvelut",
        "icon": "🏡",
        "description": "Kaikki vapaa-ajan asunnon huoltoon ja nauttimiseen.",
        "profilointi_context": "cottage_services",
        "steps": [
            {
                "id": "tarkennus",
                "question": "Millaista mökkipalvelua etsit?",
                "options": [
                    { "label": "Talvivalvonta & Huolenpito", "sub_context": "talvivalvonta", "tags": ["kiinteistöhuolto"] },
                    { "label": "Kevätkunnostus / Siivous", "sub_context": "kevatkunnostus", "tags": ["siivous"] },
                    { "label": "Polttopuut & Peruspalvelut", "sub_context": "polttopuut", "tags": ["polttopuut"] },
                    { "label": "Remontointi & Laiturit", "sub_context": "mokkiremontti", "tags": ["rakentaminen"] }
                ]
            },
            {
                "id": "perushuolto",
                "multiple": true,
                "question": "Mitä huoltoa mökki kaipaa?",
                "options": [
                    { "label": "Kiinteistöhuolto / Talonmies", "tags": ["kiinteistöhuolto"], "profilointi_filter": { "section": "cottage_services", "field": "key_holding", "value": true } },
                    { "label": "Nuohous", "tags": ["nuohouspalvelut"] },
                    { "label": "Polttopuut", "tags": ["polttopuut"] },
                    { "label": "Laituritarvikkeet / Huolto", "tags": ["rakentaminen"], "profilointi_filter": { "section": "cottage_services", "field": "dock_maintenance", "value": true } }
                ]
            },
            {
                "id": "piha-ja-tekniikka",
                "multiple": true,
                "question": "Pihan ja tekniikan tarpeet?",
                "options": [
                    { "label": "Pihanhoito / Viherrakentaminen", "tags": ["viherrakentaminen", "pihasuunnittelu"] },
                    { "label": "Pienkonehuolto (ruohonleikkurit ym.)", "tags": ["pienkonehuolto"] },
                    { "label": "Taksi / Kuljetus", "tags": ["taksi", "kuljetus"] }
                ]
            }
        ]
    },
    "taloyhtion-huolto": {
        "title": "Taloyhtiön huolto",
        "icon": "🏢",
        "description": "Ammattitaitoiset kumppanit taloyhtiöille.",
        "profilointi_context": "housing_company_and_contracts",
        "steps": [
            {
                "id": "tarkennus",
                "question": "Millaista palvelua taloyhtiö tarvitsee?",
                "options": [
                    { "label": "Jatkuva kiinteistöhuolto", "sub_context": "kiinteistöhuolto", "tags": ["kiinteistöhuolto"] },
                    { "label": "Isännöintipalvelut", "sub_context": "isännöinti", "tags": ["isännöinti"] },
                    { "label": "Kertaluonteinen remontti", "sub_context": "linjasaneeraus", "tags": ["rakentaminen"] }
                ]
            },
            {
                "id": "hallinto",
                "question": "Hallinnolliset tarpeet?",
                "options": [
                    { "label": "Isännöintipalvelut", "tags": ["isännöinti"] },
                    { "label": "Tilitoimisto / Tilintarkastus", "tags": ["tilitoimisto"] },
                    { "label": "Lakipalvelut", "tags": ["lakiasiaintoimistot"] }
                ]
            },
            {
                "id": "kunnossapito",
                "multiple": true,
                "question": "Kunnossapito ja tekniset palvelut?",
                "options": [
                    { "label": "Kiinteistöhuolto", "tags": ["kiinteistöhuolto"], "profilointi_filter": { "section": "housing_company_and_contracts", "field": "housing_company_specialized", "value": true } },
                    { "label": "Siivouspalvelut", "tags": ["siivous"] },
                    { "label": "Nuohous", "tags": ["nuohouspalvelut"] },
                    { "label": "LVI- ja sähköhuolto", "tags": ["LVI", "sähköasennukset"] },
                    { "label": "Hissihuolto", "tags": ["it-palvelut"] }
                ]
            }
        ]
    },
    "hautajaiset": {
        "title": "Hautajaiset",
        "icon": "🕯️",
        "description": "Arvokkaat ja huolelliset hautajaisjärjestelyt.",
        "profilointi_context": "funerals_and_memorials",
        "steps": [
            {
                "id": "paatarve",
                "multiple": true,
                "question": "Mitä asioita haluatte edistää?",
                "options": [
                    { "label": "Hautajaisjärjestelyt", "sub_context": "hautauspalvelu", "tags": ["hautauspalvelu"] },
                    { "label": "Muistotilaisuus", "sub_context": "muistotilaisuus", "tags": ["muistotilaisuus", "muistotilaisuudet"], "capacity_req": 10 },
                    { "label": "Perunkirjoitus ja laki-asiat", "sub_context": "perunkirjoitus", "tags": ["lakiasiaintoimistot", "perunkirjoitus"] }
                ]
            },
            {
                "id": "peruspalvelu",
                "hide_results": true,
                "question": "Hautauspalvelut?",
                "skipIf": "!isSelected('paatarve', 'Hautajaisjärjestelyt')",
                "options": [
                    { "label": "Hautauspalvelu ja arkut", "tags": ["hautauspalvelu"] },
                    { "label": "Hautakivet ja kaiverrukset", "tags": ["hautauspalvelu"] }
                ]
            },
            {
                "id": "kapasiteetti",
                "question": "Kuinka paljon henkilöitä muistotilaisuuteen osallistuu?",
                "skipIf": "!isSelected('paatarve', 'Muistotilaisuus')",
                "options": [
                    { "label": "Alle 20 henkilöä", "capacity_req": 20, "tags": [] },
                    { "label": "Noin 20 - 50 henkilöä", "capacity_req": 50, "tags": [] },
                    { "label": "Noin 50 - 100 henkilöä", "capacity_req": 100, "tags": [] },
                    { "label": "Yli 100 henkilöä", "capacity_req": 150, "tags": [] }
                ]
            },
            {
                "id": "muistotila",
                "hide_results": true,
                "question": "Muistotilaisuuden tila?",
                "skipIf": "!isSelected('paatarve', 'Muistotilaisuus')",
                "options": [
                    {
                        "label": "Rauhallinen muistotila",
                        "tags": ["juhlatila"],
                        "capacity_req": 20,
                        "profilointi_filter": { "section": "funerals_and_memorials", "field": "quiet_private_space", "value": true },
                        "require_fits_for": { "key": "funerals_and_memorials", "min": 30 }
                    },
                    {
                        "label": "Seurakuntasali",
                        "tags": ["seurakunta"]
                    },
                    {
                        "label": "Tarvitsen vain catering-palvelun",
                        "tags": [],
                        "profilointi_filter": { "section": "funerals_and_memorials", "field": "memorial_catering", "value": true },
                        "require_fits_for": { "key": "funerals_and_memorials", "min": 20 }
                    }
                ]
            },
            {
                "id": "muistotilaisuus_lisapalvelut",
                "multiple": true,
                "hide_results": true,
                "question": "Muistotilaisuuden lisäpalvelut?",
                "skipIf": "!isSelected('paatarve', 'Muistotilaisuus')",
                "options": [
                    {
                        "label": "Kahvitus / Pitopalvelu",
                        "tags": ["pitopalvelu"],
                        "profilointi_filter": { "section": "funerals_and_memorials", "field": "memorial_catering", "value": true },
                        "require_fits_for": { "key": "funerals_and_memorials", "min": 20 }
                    },
                    {
                        "label": "Kukkatervehdykset",
                        "tags": ["kukkakauppa"],
                        "profilointi_filter": { "section": "funerals_and_memorials", "field": "funeral_flowers", "value": true }
                    },
                    { "label": "Kuljetuspalvelut", "tags": ["hautauspalvelu", "kuljetus"],
                        "profilointi_filter": { "section": "funerals_and_memorials", "field": "transport_assistance", "value": true }
                    }
                ]
            },
            {
                "id": "laki_asiat_tarkennus",
                "multiple": true,
                "hide_results": true,
                "question": "Lakipalvelut ja asiakirjat?",
                "skipIf": "!isSelected('paatarve', 'Laki-asiat')",
                "options": [
                    { "label": "Perunkirjoitus", "tags": ["lakiasiaintoimistot"] },
                    { "label": "Testamentti ja edunvalvonta", "tags": ["lakiasiaintoimistot"] },
                    { "label": "Lakiasiain neuvonta", "tags": ["lakiasiaintoimistot"] }
                ]
            },
            {
                "id": "muistot_ja_tallennus",
                "multiple": true,
                "question": "Haluaisitko tallentaa muistot tai tarvitsetko digitointipalveluita?",
                "options": [
                    { "label": "Muistovideo / Videointi / Esitykset", "tags": ["videotuotanto", "videokuvaus", "videokuvaaja"], "profilointi_filter": { "section": "funerals_and_memorials", "field": "refinement_tags", "value": "muistotilaisuuskuvaus" } },
                    { "label": "Valokuvaus", "tags": ["valokuvaus", "hautajaiskuvaus"], "profilointi_filter": { "section": "funerals_and_memorials", "field": "refinement_tags", "value": "hautajaiskuvaus" } },
                    { "label": "Digitointipalvelut (kuvat, videot ym.)", "tags": ["digitointi"] }
                ]
            },
            {
                "id": "hautajaiset_digitointi_tarkennus",
                "multiple": true,
                "question": "Mitä haluaisit digitoida muistoesitystä varten?",
                "skipIf": "!isSelected('muistot_ja_tallennus', 'digitointi')",
                "options": [
                    { "label": "Valokuvien ja diojen digitointi", "tags": ["digitointi"], "profilointi_filter": { "section": "funerals_and_memorials", "field": "digitization_features", "value": "valokuvien, diojen ja negatiivien digitointi" } },
                    { "label": "VHS- tai DVD-materiaalin digitointi", "tags": ["digitointi"] },
                    { "label": "Muisteluvideo / Diashow / Kuvakirja", "tags": ["digitointi"], "profilointi_filter": { "section": "funerals_and_memorials", "field": "digitization_features", "value": "muisteluun soveltuvat diashow- ja kuvakirjapalvelut" } }
                ]
            }
        ]
    },
    "yrityksen-perustaminen": {
        "title": "Yrityksen perustaminen",
        "icon": "🚀",
        "description": "Kaikki tarvittava uuden yrityksen starttiin.",
        "profilointi_context": "startup_services",
        "steps": [
            {
                "id": "tarkennus",
                "question": "Missä vaiheessa yrityksen perustaminen on?",
                "options": [
                    { "label": "Liikeidea & Suunnittelu", "sub_context": "liikeidea", "tags": ["konsultointi"] },
                    { "label": "Rekisteröinti & Hallinto", "sub_context": "rekisterointi", "tags": ["tilitoimisto"] },
                    { "label": "Markkinointi & Verkkosivut", "sub_context": "digimarkkinointi", "tags": ["it-palvelut"] }
                ]
            },
            {
                "id": "hallinto",
                "multiple": true,
                "question": "Alkuvaiheen hallinto?",
                "options": [
                    { "label": "Yritysneuvonta / Liiketoimintasuunnitelma", "tags": ["yritysneuvonta", "konsultointi"], "profilointi_filter": { "section": "startup_services", "field": "business_advisory", "value": true } },
                    { "label": "Kirjanpito ja tilitoimisto", "tags": ["tilitoimisto"] },
                    { "label": "Vakuutukset", "tags": ["vakuutus"] },
                    { "label": "Lakipalvelut", "tags": ["lakiasiaintoimistot"] }
                ]
            },
            {
                "id": "nakyvyys",
                "multiple": true,
                "question": "Markkinointi ja näkyvyys?",
                "options": [
                    { "label": "Verkkosivut / Domain", "tags": ["verkkosivut", "it-palvelut", "kotisivut"], "profilointi_filter": { "section": "startup_services", "field": "refinement_tags", "value": "verkkosivut" } },
                    { "label": "Logo ja brändäys", "tags": ["mainostoimisto", "graafiset palvelut", "brändäys"], "profilointi_filter": { "section": "startup_services", "field": "refinement_tags", "value": "brändäys" } },
                    { "label": "Somemainonta ja Google-näkyvyys", "tags": ["somemainonta", "google-mainonta", "mainostoimisto", "digimarkkinointi"] },
                    { "label": "Valokuvaus / Yrityskuvat", "tags": ["valokuvaus", "valokuvaaja"], "profilointi_filter": { "section": "startup_services", "field": "refinement_tags", "value": "yrityskuvat" } }
                ]
            }
        ]
    },
    "yrityksen-kehittaminen": {
        "title": "Yrityksen kehittäminen",
        "icon": "📈",
        "description": "Vie yrityksesi seuraavalle tasolle kasvun avulla.",
        "profilointi_context": "business_growth",
        "steps": [
            {
                "id": "tarkennus",
                "question": "Millaista kehitystä yrityksesi kaipaa?",
                "options": [
                    { "label": "Digitaalinen markkinointi & Myynti", "sub_context": "digitaalinen myynti", "tags": ["mainostoimisto"] },
                    { "label": "Henkilöstö & Rekrytointi", "sub_context": "rekrytointi", "tags": ["henkilöstöpalvelut"] },
                    { "label": "Liikkeenjohdon konsultointi", "sub_context": "konsultointi", "tags": ["konsultointi"] }
                ]
            },
            {
                "id": "myynti",
                "multiple": true,
                "question": "Lisää myyntiä ja tunnettuutta?",
                "options": [
                    { "label": "Google-mainonta / SEO", "tags": ["google-mainonta", "mainostoimisto"] },
                    { "label": "Sosiaalisen median markkinointi", "tags": ["somemainonta", "mainostoimisto"] },
                    { "label": "Verkkokaupan rakentaminen", "tags": ["verkkokauppa", "it-palvelut"] },
                    { "label": "Videotuotanto / Mainosvideot", "tags": ["videotuotanto", "videomarkkinointi", "video"], "profilointi_filter": { "section": "business_growth", "field": "refinement_tags", "value": "videomarkkinointi" } }
                ]
            },
            {
                "id": "henkilosto",
                "multiple": true,
                "question": "Resurssit ja osaaminen?",
                "options": [
                    { "label": "Rekrytointipalvelut", "tags": ["henkilöstöpalvelut"] },
                    { "label": "Henkilöstön koulutus", "tags": ["koulutus"] },
                    { "label": "Liikkeenjohdon konsultointi", "tags": ["konsultointi"] }
                ]
            }
        ]
    },
    "vakituinen-palvelukumppani": {
        "title": "Vakituinen palvelukumppani",
        "icon": "🤝",
        "description": "Etsitkö jatkuvaa kumppania helpottamaan arkea?",
        "profilointi_context": "vapaa-aika",
        "steps": [
            {
                "id": "ala",
                "question": "Millä osa-alueella tarvitset kumppania?",
                "options": [
                    { "label": "IT- ja tietotekniikka", "tags": ["it-palvelut", "vakiopalvelu"] },
                    { "label": "Siivous ja kiinteistöhuolto", "tags": ["siivous", "kiinteistöhuolto", "vakiopalvelu"] },
                    { "label": "Kirjanpito ja taloushallinto", "tags": ["tilitoimisto"] },
                    { "label": "Markkinointikumppani", "tags": ["mainostoimisto", "vakiopalvelu"] }
                ]
            }
        ]
    },
    "kiinteistopalvelut": {
        "title": "Kiinteistöpalvelut",
        "icon": "🏘️",
        "description": "Huolenpitoa ja arvoa kiinteistöllesi.",
        "profilointi_context": "housing_company_and_contracts",
        "steps": [
            {
                "id": "huoltopalvelu",
                "multiple": true,
                "question": "Mitä kiinteistösi tarvitsee?",
                "options": [
                    { "label": "Kiinteistöhuolto (tekniikka, lumityöt ym.)", "tags": ["kiinteistöhuolto"] },
                    { "label": "Siivouspalvelut (sisä ja ulko)", "tags": ["siivous", "puhdistuspalvelut"] },
                    { "label": "Pihanhoito / Lumenauraus", "tags": ["viherrakentaminen", "kiinteistöhuolto"] },
                    { "label": "Kuntokartoitus / Suunnittelu", "tags": ["suunnittelutoimisto"] }
                ]
            }
        ]
    },
    "paivystavat-palvelut": {
        "title": "Päivystävät palvelut",
        "icon": "🚨",
        "description": "Apu lähellä silloin kun sitä tarvitaan kiireellisesti.",
        "profilointi_context": "construction_and_maintenance",
        "steps": [
            {
                "id": "kiireellinen",
                "question": "Mikä hätänä?",
                "options": [
                    { "label": "LVI- tai putkipäivystys", "tags": ["LVI", "päivystys"], "profilointi_filter": { "section": "construction_and_maintenance", "field": "emergency_service", "value": true } },
                    { "label": "Sähköpäivystys", "tags": ["sähköasennukset", "päivystys"], "profilointi_filter": { "section": "construction_and_maintenance", "field": "emergency_service", "value": true } },
                    { "label": "Hinaus ja tiepalvelu", "tags": ["hinaus"] },
                    { "label": "Lukkoseppä (avaimet hukkuneet)", "tags": ["lukkoseppä", "päivystys"] }
                ]
            }
        ]
    },
    "terveys-ja-hyvinvointi": {
        "title": "Terveys ja hyvinvointi",
        "icon": "🏥",
        "description": "Löydä asiantuntijat terveyden ja hyvän olon tueksi.",
        "profilointi_context": "wellbeing_and_beauty",
        "steps": [
            {
                "id": "tarkennus",
                "question": "Millaista hyvinvointipalvelua etsit?",
                "options": [
                    { "label": "Hieronnat & Kehonhuolto", "sub_context": "hieronta", "tags": ["hieronta"] },
                    { "label": "Kauneudenhoito & Kampaamot", "sub_context": "kauneudenhoito", "tags": ["kampaamo", "kauneus"] },
                    { "label": "Terveyspalvelut & Lääkärit", "sub_context": "terveyspalvelut", "tags": ["terveyspalvelut"] },
                    { "label": "Mielen hyvinvointi & Terapia", "sub_context": "terapia", "tags": ["psykologi"] },
                    { "label": "Hää- ja juhlapalvelut", "sub_context": "bridal_services", "tags": ["meikki", "kampaus"], "profilointi_filter": { "section": "wellbeing_and_beauty", "field": "bridal_services", "value": true } }
                ]
            },
            {
                "id": "palvelu",
                "multiple": true,
                "question": "Millaista tukea tarvitset?",
                "options": [
                    { "label": "Lääkäri- tai terveyspalvelut", "tags": ["terveyspalvelut"] },
                    { "label": "Fysioterapia / Hieronta", "tags": ["fysioterapia", "hieronta"] },
                    { "label": "Mielenterveys / Psykologi", "tags": ["psykologi", "terapia"] },
                    { "label": "Hoivapalvelut / Kotihoito", "tags": ["kotihoito", "hoivapalvelu"], "profilointi_filter": { "section": "wellbeing_and_beauty", "field": "home_visits_available", "value": true } }
                ]
            }
        ]
    },
    "liikunta-ja-vapaaaika": {
        "title": "Liikunta ja vapaa-aika",
        "icon": "⚽",
        "description": "Harrastuksia ja liikuntaa kaikenikäisille.",
        "profilointi_context": "wellbeing_and_beauty",
        "steps": [
            {
                "id": "tyyppi",
                "question": "Miten haluaisit liikkua?",
                "options": [
                    { "label": "Kuntosali / Ryhmäliikunta", "sub_context": "kuntosali", "tags": ["kuntosali", "liikuntakeskus"] },
                    { "label": "Seurayhteistyö / Urheiluseurat", "sub_context": "urheiluseura", "tags": ["urheiluseura"] },
                    { "label": "Ulkoilu / Retkeily", "sub_context": "retkeily", "tags": ["luonto", "retkeily"] },
                    { "label": "Uinti / Vesiliikunta", "sub_context": "uinti", "tags": ["uimahalli"] }
                ]
            },
            {
                "id": "kohderyhma",
                "question": "Kenelle palvelua etsit?",
                "options": [
                    { "label": "Lapsille ja nuorille", "tags": ["lapset", "nuoret"] },
                    { "label": "Aikuisille", "tags": [] },
                    { "label": "Senioreille", "tags": ["seniorit"] },
                    { "label": "Koko perheelle", "tags": ["perhe"] }
                ]
            }
        ]
    },
    "elaimet": {
        "title": "Eläimet ja lemmikit",
        "icon": "🐾",
        "description": "Kaikki lemmikkisi parhaaksi.",
        "profilointi_context": "wellbeing_and_beauty",
        "steps": [
            {
                "id": "tarve",
                "multiple": true,
                "question": "Mitä lemmikkisi tarvitsee?",
                "options": [
                    { "label": "Eläinlääkäri", "sub_context": "elainlaakari", "tags": ["eläinlääkäri"] },
                    { "label": "Lemmikkitarvikkeet / Ruoka", "sub_context": "elaintarvikkeet", "tags": ["lemmikkitarvikkeet"] },
                    { "label": "Trimmaus / Pesu", "sub_context": "trimmaus", "tags": ["trimmaus"] },
                    { "label": "Koulutus / Hoito", "sub_context": "elainhoitola", "tags": ["koirahoitola", "eläinkoulutus"] }
                ]
            },
            {
                "id": "elainlaji",
                "question": "Minkä eläimen palveluita etsit?",
                "options": [
                    { "label": "Koira", "tags": ["koira"] },
                    { "label": "Kissa", "tags": ["kissa"] },
                    { "label": "Hevonen", "tags": ["hevonen"] },
                    { "label": "Pieneläimet", "tags": ["pieneläin"] }
                ]
            }
        ]
    },
    "lapset-ja-perhe": {
        "title": "Lapset ja perhe",
        "icon": "👶",
        "description": "Arjen tukea ja harrastuksia lapsiperheille.",
        "profilointi_context": "wellbeing_and_beauty",
        "steps": [
            {
                "id": "palvelut",
                "multiple": true,
                "question": "Millaista palvelua etsitte?",
                "options": [
                    { "label": "Päivähoito / Koulutus", "sub_context": "paivahoito", "tags": ["päiväkoti", "koulutus"] },
                    { "label": "Harrastukset lapsille", "sub_context": "lasten harrastukset", "tags": ["lapset", "harrastukset"] },
                    { "label": "Lastentarvikkeet", "sub_context": "lastentarvikkeet", "tags": ["erikoisliikkeet", "lapset"] },
                    { "label": "Perheterapia / Tuki", "sub_context": "perhetuki", "tags": ["psykologi", "perhepalvelut"] }
                ]
            },
            {
                "id": "ika",
                "question": "Minkä ikäisistä lapsista on kyse?",
                "options": [
                    { "label": "Vauvat ja taaperot (0-3v)", "tags": ["vauva"] },
                    { "label": "Leikki-ikäiset (3-6v)", "tags": ["lapset"] },
                    { "label": "Koululaiset", "tags": ["koululainen"] },
                    { "label": "Nuoret / Teinit", "tags": ["nuoret"] }
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
