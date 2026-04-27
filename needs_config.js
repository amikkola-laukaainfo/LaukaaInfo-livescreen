const NEEDS_CONFIG = {
    "haat": {
        "title": "Häät",
        "icon": "💒",
        "description": "Suunnittele unelmiesi häät Laukaassa. Löydä tilat, tarjoilut ja elämykset.",
        "profilointi_context": "häät",
        "steps": [
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
                    { "label": "Juhlatila (iso)", "tags": ["juhlatila"], "profilointi_filter": { "section": "events_and_celebrations", "field": "wedding_specialized", "value": true } },
                    { "label": "Tunnelmallinen kartano", "tags": ["kartano", "juhlatila"] },
                    { "label": "Luonnonläheinen tila", "tags": ["luonto", "juhlatila"], "profilointi_filter": { "section": "events_and_celebrations", "field": "is_lakeside", "value": true } }
                ]
            },
            {
                "id": "pitopalvelu",
                "question": "Tarvitsetko pitopalvelun?",
                "skipIf": "selections.tila && getSelectedCompanyProfilointi('tila', 'events_and_celebrations', 'has_exclusive_catering')",
                "skipMessage": "Valitsemassasi tilassa on oma catering — pitopalvelu sisältyy.",
                "options": [
                    { "label": "Kyllä — tarvitsen pitopalvelun", "tags": ["pitopalvelu"] },
                    { "label": "Ei — tila järjestää ruoan", "tags": [] },
                    { "label": "En tiedä vielä", "tags": [] }
                ]
            },
            {
                "id": "palvelut",
                "multiple": true,
                "question": "Mitä muita palveluita tarvitset juhlatpäivään?",
                "options": [
                    { "label": "Valokuvaaja", "tags": ["valokuvaus"], "profilointi_filter": { "section": "events_and_celebrations", "field": "wedding_photography", "value": true } },
                    { "label": "Kukkakauppa & Koristelu", "tags": ["kukkakauppa"] },
                    { "label": "Musiikki tai DJ", "tags": ["musiikki", "ohjelmapalvelut"], "profilointi_filter": { "section": "events_and_celebrations", "field": "live_music", "value": true } }
                ]
            },
            {
                "id": "vieraat",
                "multiple": true,
                "question": "Tarpeet vieraiden mukavuuteen?",
                "skipIf": "selections.tila && getSelectedCompanyProfilointi('tila', 'events_and_celebrations', 'accommodation_included')",
                "skipMessage": "Valitsemassasi tilassa majoitus sisältyy pakettiin — ei tarvetta erikseen.",
                "options": [
                    { "label": "Majoitus vieraille", "tags": ["majoitus"] },
                    { "label": "Kuljetus / Bussi / Taksi", "tags": ["taksi", "kuljetus"] },
                    { "label": "Kauneuspalvelut / Meikki", "tags": ["kauneus", "kampaamo"] }
                ]
            }
        ]
    },
    "yritysjuhlat": {
        "title": "Yritysjuhlat",
        "icon": "🥂",
        "description": "Järjestä onnistuneet henkilöstöjuhlat, pikkujoulut tai asiakastilaisuudet.",
        "steps": [
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
                "id": "tyyppi",
                "question": "Millaista tilaisuutta olet järjestämässä?",
                "options": [
                    { "label": "Henkilöstöjuhlat / Pikkujoulut", "tags": ["henkilöstöjuhlat", "juhlatila"] },
                    { "label": "Asiakastilaisuus / Edustus", "tags": ["asiakastilaisuus", "edustustila"] },
                    { "label": "Virkistyspäivä / Tiimi-ilta", "tags": ["virkistyspäivä", "ohjelmapalvelut"] }
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
                    { "label": "Saunatilat", "tags": ["saunatilat"] },
                    { "label": "Ohjelmapalvelut / Elämykset", "tags": ["ohjelmapalvelut"] }
                ]
            }
        ]
    },
    "yritystilaisuudet": {
        "title": "Yritystilaisuudet",
        "icon": "💼",
        "description": "Kokoukset, seminaarit ja koulutukset ammattimaisessa ympäristössä.",
        "steps": [
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
                "question": "Millaista tilaa tarvitsette?",
                "options": [
                    { "label": "Kokoushuone (pieni)", "tags": ["kokoustilat"] },
                    { "label": "Seminaari / Koulutustila", "tags": ["seminaaritilat", "koulutus"] },
                    { "label": "Edustustila / Saunallinen tila", "tags": ["edustustila", "saunatilat"] }
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
                    { "label": "Yrityslahjat", "tags": ["yrityslahjat", "lahjatavarat"] },
                    { "label": "IT-tuki / AV-tekniikka", "tags": ["it-palvelut"] }
                ]
            }
        ]
    },
    "syntymapaivat": {
        "title": "Syntymäpäivät",
        "icon": "🎂",
        "description": "Järjestä ikimuistoiset syntymäpäivät kaikenikäisille.",
        "steps": [
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
                    { "label": "Ravintolassa valmiissa pöydässä", "tags": ["ravintola"] },
                    { "label": "Vuokratussa juhlatilassa", "tags": ["juhlatila"] },
                    { "label": "Kotona (tarvitaan palveluita)", "tags": ["pitopalvelu"] },
                    { "label": "Saunalla tai mökillä", "tags": ["saunatilat", "majoitus"] }
                ]
            },
            {
                "id": "palvelut",
                "multiple": true,
                "question": "Mitä tarvitaan onnistuneisiin juhliin?",
                "options": [
                    { "label": "Pitopalvelu / Ruoat", "tags": ["pitopalvelu"] },
                    { "label": "Kakut / Leivonnaiset", "tags": ["leipomo", "elintarvike"] },
                    { "label": "Ohjelma / Esiintyjä", "tags": ["ohjelmapalvelut"] },
                    { "label": "Valokuvaus", "tags": ["valokuvaus"] },
                    { "label": "Kukat", "tags": ["kukkakauppa"] }
                ]
            }
        ]
    },
    "muutto": {
        "title": "Muutto",
        "icon": "📦",
        "description": "Muuttoauto, kantajat, pakkaus ja loppusiivous helposti.",
        "steps": [
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
        "steps": [
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
        "steps": [
            {
                "id": "perushuolto",
                "multiple": true,
                "question": "Mitä huoltoa mökki kaipaa?",
                "options": [
                    { "label": "Kiinteistöhuolto / Talonmies", "tags": ["kiinteistöhuolto"] },
                    { "label": "Nuohous", "tags": ["nuohouspalvelut"] },
                    { "label": "Polttopuut", "tags": ["polttopuut"] },
                    { "label": "Laituritarvikkeet / Huolto", "tags": ["rakentaminen"] }
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
        "steps": [
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
                    { "label": "Kiinteistöhuolto", "tags": ["kiinteistöhuolto"] },
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
        "profilointi_context": "hautajaiset",
        "steps": [
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
                "id": "peruspalvelu",
                "question": "Hautauspalvelut?",
                "options": [
                    { "label": "Hautauspalvelu ja arkut", "tags": ["hautauspalvelu"] },
                    { "label": "Hautakivet ja kaiverrukset", "tags": ["hautauspalvelu"] }
                ]
            },
            {
                "id": "muistotila",
                "question": "Muistotilaisuuden tila?",
                "options": [
                    {
                        "label": "Rauhallinen muistotila",
                        "tags": [],
                        "profilointi_filter": { "section": "funerals_and_memorials", "field": "quiet_private_space", "value": true },
                        "require_fits_for": { "key": "hautajaiset", "min": 30 }
                    },
                    {
                        "label": "Seurakuntasali",
                        "tags": ["seurakunta"]
                    },
                    {
                        "label": "Tarvitsen vain catering-palvelun",
                        "tags": [],
                        "profilointi_filter": { "section": "funerals_and_memorials", "field": "memorial_catering", "value": true },
                        "require_fits_for": { "key": "hautajaiset", "min": 20 }
                    }
                ]
            },
            {
                "id": "jarjestelyt",
                "multiple": true,
                "question": "Muistotilaisuuden lisäjärjestelyt?",
                "options": [
                    {
                        "label": "Kahvitus / Pitopalvelu",
                        "tags": ["pitopalvelu"],
                        "profilointi_filter": { "section": "funerals_and_memorials", "field": "memorial_catering", "value": true },
                        "require_fits_for": { "key": "hautajaiset", "min": 20 }
                    },
                    {
                        "label": "Kukkatervehdykset",
                        "tags": ["kukkakauppa"],
                        "profilointi_filter": { "section": "funerals_and_memorials", "field": "funeral_flowers", "value": true }
                    },
                    { "label": "Lakipalvelut / Perunkirjoitus", "tags": ["lakiasiaintoimistot"] },
                    { "label": "Kuljetus", "tags": ["hautauspalvelu", "kuljetus"],
                        "profilointi_filter": { "section": "funerals_and_memorials", "field": "transport_assistance", "value": true }
                    }
                ]
            }
        ]
    },
    "yrityksen-perustaminen": {
        "title": "Yrityksen perustaminen",
        "icon": "🚀",
        "description": "Kaikki tarvittava uuden yrityksen starttiin.",
        "steps": [
            {
                "id": "hallinto",
                "multiple": true,
                "question": "Alkuvaiheen hallinto?",
                "options": [
                    { "label": "Yritysneuvonta / Liiketoimintasuunnitelma", "tags": ["yritysneuvonta", "konsultointi"] },
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
                    { "label": "Verkkosivut / Domain", "tags": ["verkkosivut", "it-palvelut"] },
                    { "label": "Logo ja brändäys", "tags": ["mainostoimisto", "graafiset palvelut"] },
                    { "label": "Somemainonta ja Google-näkyvyys", "tags": ["somemainonta", "google-mainonta", "mainostoimisto"] },
                    { "label": "Valokuvaus / Yrityskuvat", "tags": ["valokuvaus"] }
                ]
            },
            {
                "id": "tilat",
                "question": "Toimitilat?",
                "options": [
                    { "label": "Toimitilojen haku", "tags": ["toimitilat", "kiinteistönvälitys"] },
                    { "label": "Etätyö / Co-working", "tags": ["toimitilat"] },
                    { "label": "IT-infra ja yhteydet", "tags": ["it-palvelut"] }
                ]
            }
        ]
    },
    "yrityksen-kehittaminen": {
        "title": "Yrityksen kehittäminen",
        "icon": "📈",
        "description": "Vie yrityksesi seuraavalle tasolle kasvun avulla.",
        "steps": [
            {
                "id": "myynti",
                "multiple": true,
                "question": "Lisää myyntiä ja tunnettuutta?",
                "options": [
                    { "label": "Google-mainonta / SEO", "tags": ["google-mainonta", "mainostoimisto"] },
                    { "label": "Sosiaalisen median markkinointi", "tags": ["somemainonta", "mainostoimisto"] },
                    { "label": "Verkkokaupan rakentaminen", "tags": ["verkkokauppa", "it-palvelut"] },
                    { "label": "Videotuotanto / Mainosvideot", "tags": ["videotuotanto"] }
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
        "steps": [
            {
                "id": "kiireellinen",
                "question": "Mikä hätänä?",
                "options": [
                    { "label": "LVI- tai putkipäivystys", "tags": ["LVI", "päivystys"] },
                    { "label": "Sähköpäivystys", "tags": ["sähköasennukset", "päivystys"] },
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
        "steps": [
            {
                "id": "palvelu",
                "multiple": true,
                "question": "Millaista tukea tarvitset?",
                "options": [
                    { "label": "Lääkäri- tai terveyspalvelut", "tags": ["terveyspalvelut"] },
                    { "label": "Fysioterapia / Hieronta", "tags": ["fysioterapia", "hieronta"] },
                    { "label": "Mielenterveys / Psykologi", "tags": ["psykologi", "terapia"] },
                    { "label": "Hoivapalvelut / Kotihoito", "tags": ["kotihoito", "hoivapalvelu"] }
                ]
            }
        ]
    },
    "liikunta-ja-vapaaaika": {
        "title": "Liikunta ja vapaa-aika",
        "icon": "⚽",
        "description": "Harrastuksia ja liikuntaa kaikenikäisille.",
        "steps": [
            {
                "id": "tyyppi",
                "question": "Miten haluaisit liikkua?",
                "options": [
                    { "label": "Kuntosali / Ryhmäliikunta", "tags": ["kuntosali", "liikuntakeskus"] },
                    { "label": "Seurayhteistyö / Urheiluseurat", "tags": ["urheiluseura"] },
                    { "label": "Ulkoilu / Retkeily", "tags": ["luonto", "retkeily"] },
                    { "label": "Uinti / Vesiliikunta", "tags": ["uimahalli"] }
                ]
            }
        ]
    },
    "elaimet": {
        "title": "Eläimet ja lemmikit",
        "icon": "🐾",
        "description": "Kaikki lemmikkisi parhaaksi.",
        "steps": [
            {
                "id": "tarve",
                "multiple": true,
                "question": "Mitä lemmikkisi tarvitsee?",
                "options": [
                    { "label": "Eläinlääkäri", "tags": ["eläinlääkäri"] },
                    { "label": "Lemmikkitarvikkeet / Ruoka", "tags": ["lemmikkitarvikkeet"] },
                    { "label": "Trimmaus / Pesu", "tags": ["trimmaus"] },
                    { "label": "Koulutus / Hoito", "tags": ["koirahoitola", "eläinkoulutus"] }
                ]
            }
        ]
    },
    "lapset-ja-perhe": {
        "title": "Lapset ja perhe",
        "icon": "👶",
        "description": "Arjen tukea ja harrastuksia lapsiperheille.",
        "steps": [
            {
                "id": "palvelut",
                "multiple": true,
                "question": "Millaista palvelua etsitte?",
                "options": [
                    { "label": "Päivähoito / Koulutus", "tags": ["päiväkoti", "koulutus"] },
                    { "label": "Harrastukset lapsille", "tags": ["lapset", "harrastukset"] },
                    { "label": "Lastentarvikkeet", "tags": ["erikoisliikkeet", "lapset"] },
                    { "label": "Perheterapia / Tuki", "tags": ["psykologi", "perhepalvelut"] }
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
