const NEEDS_CONFIG = {
    "haat": {
        "title": "Häät",
        "icon": "💒",
        "description": "Suunnittele unelmiesi häät Laukaassa. Löydä tilat, tarjoilut ja elämykset.",
        "steps": [
            {
                "id": "tila",
                "question": "Millaista juhlatilaa etsit?",
                "options": [
                    { "label": "Juhlatila (iso)", "tags": ["juhlatila"], "filters": { "capacity": ">100" } },
                    { "label": "Tunnelmallinen kartano", "tags": ["kartano", "juhlatila"] },
                    { "label": "Luonnonläheinen tila", "tags": ["luonto", "juhlatila"] }
                ]
            },
            {
                "id": "tarjoilu",
                "question": "Miten haluat järjestää tarjoilun?",
                "options": [
                    { "label": "Pitopalvelu (Catering)", "tags": ["pitopalvelu"] },
                    { "label": "Ravintolapalvelu", "tags": ["ravintola"] }
                ]
            },
            {
                "id": "ohjelma",
                "question": "Tarvitsetko ohjelmaa tai kuvausta?",
                "options": [
                    { "label": "Ohjelmapalvelut", "tags": ["ohjelmapalvelut"] },
                    { "label": "Valokuvaaja", "tags": ["valokuvaus"] },
                    { "label": "Musiikki / DJ", "tags": ["musiikki", "ohjelmapalvelut"] }
                ]
            }
        ]
    },
    "yritysjuhlat": {
        "title": "Yritysjuhlat",
        "icon": "🥂",
        "description": "Järjestä onnistuneet henkilöstöjuhlat tai asiakastilaisuudet.",
        "steps": [
            {
                "id": "tyyppi",
                "question": "Millaista tilaisuutta olet järjestämässä?",
                "options": [
                    { "label": "Henkilöstöjuhlat", "tags": ["henkilöstöjuhlat", "juhlatila"] },
                    { "label": "Asiakastilaisuus", "tags": ["asiakastilaisuus", "edustustila"] },
                    { "label": "Virkistyspäivä", "tags": ["virkistyspäivä", "ohjelmapalvelut"] }
                ]
            },
            {
                "id": "palvelut",
                "question": "Mitä lisäpalveluita tarvitsette?",
                "options": [
                    { "label": "Pitopalvelu", "tags": ["pitopalvelu"] },
                    { "label": "Kuljetukset", "tags": ["kuljetus", "taksi"] },
                    { "label": "Majoitus", "tags": ["majoitus"] },
                    { "label": "AV-tekniikka", "tags": ["av-tekniikka", "it-palvelut"] }
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
                "id": "tila",
                "question": "Tarve?",
                "options": [
                    { "label": "Kokoustilat", "tags": ["kokoustilat"] },
                    { "label": "Seminaaritilat", "tags": ["seminaaritilat"] },
                    { "label": "Saunatilat", "tags": ["saunatilat"] }
                ]
            },
            {
                "id": "varustelu",
                "question": "Lisätarpeet?",
                "options": [
                    { "label": "Lounas / Kahvitus", "tags": ["ravintola", "pitopalvelu"] },
                    { "label": "Majoitus", "tags": ["majoitus"] },
                    { "label": "Yrityslahjat", "tags": ["yrityslahjat", "lahjatavarat"] }
                ]
            }
        ]
    },
    "syntymapaivat": {
        "title": "Syntymäpäivät",
        "icon": "🎂",
        "description": "Juhlista merkkipäivää helposti.",
        "steps": [
            {
                "id": "tila",
                "question": "Missä haluat juhlia?",
                "options": [
                    { "label": "Ravintolassa", "tags": ["ravintola"] },
                    { "label": "Vuokratilassa", "tags": ["juhlatila"] },
                    { "label": "Saunalla", "tags": ["saunatilat"] }
                ]
            },
            {
                "id": "ohjelma",
                "question": "Tarvitaanko ohjelmaa?",
                "options": [
                    { "label": "Pitopalvelu (kotiin)", "tags": ["pitopalvelu"] },
                    { "label": "Ohjelmapalvelu", "tags": ["ohjelmapalvelut"] },
                    { "label": "Kakut / Leivonnaiset", "tags": ["leipomo", "elintarvike"] }
                ]
            }
        ]
    },
    "muutto": {
        "title": "Muutto",
        "icon": "📦",
        "description": "Suunnitteletko muuttoa? Me autamme löytämään palvelut.",
        "steps": [
            {
                "id": "apu",
                "question": "Mitä apua tarvitset?",
                "options": [
                    { "label": "Muuttopalvelu / Kuljetus", "tags": ["kuljetusliike", "hinaus"] },
                    { "label": "Varastointi", "tags": ["varastointi"] },
                    { "label": "Muuttosiivous", "tags": ["siivous", "puhdistuspalvelut"] }
                ]
            }
        ]
    },
    "remontti": {
        "title": "Remontti",
        "icon": "🔨",
        "description": "Kodun tai toimitilan uudistus.",
        "steps": [
            {
                "id": "tyo",
                "question": "Millaista työtä tarvitaan?",
                "options": [
                    { "label": "Rakentaminen / Remontointi", "tags": ["rakentaminen", "rakennustyöt"] },
                    { "label": "Sähkötyöt", "tags": ["sähköasennukset"] },
                    { "label": "LVI-työt", "tags": ["LVI"] },
                    { "label": "Maalaus", "tags": ["maalaustyöt"] }
                ]
            },
            {
                "id": "tarvikkeet",
                "question": "Mistä tarvikkeet?",
                "options": [
                    { "label": "Rautakauppa / Materiaalit", "tags": ["rautakauppa", "rakennustarvikkeet"] },
                    { "label": "Konevuokraus", "tags": ["rakennuskonevuokraus"] }
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
                "id": "huolto",
                "question": "Mitä huoltoa mökki kaipaa?",
                "options": [
                    { "label": "Kiinteistöhuolto", "tags": ["kiinteistöhuolto"] },
                    { "label": "Nuohous", "tags": ["nuohouspalvelut"] },
                    { "label": "Polttopuut", "tags": ["polttopuut"] },
                    { "label": "Pihanhoito", "tags": ["viherrakentaminen", "pihasuunnittelu"] }
                ]
            },
            {
                "id": "palvelut",
                "question": "Mitä muuta tarvitset?",
                "options": [
                    { "label": "Pienkonehuolto", "tags": ["pienkonehuolto"] },
                    { "label": "Kuljetuspalvelut", "tags": ["taksi", "kuljetus"] }
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
                "question": "Hallinnolliset palvelut",
                "options": [
                    { "label": "Isännöinti", "tags": ["isännöinti"] },
                    { "label": "Tilintarkastus", "tags": ["tilitoimisto"] }
                ]
            },
            {
                "id": "yllapito",
                "question": "Ylläpito ja korjaus",
                "options": [
                    { "label": "Kiinteistöhuolto", "tags": ["kiinteistöhuolto"] },
                    { "label": "Nuohous", "tags": ["nuohouspalvelut"] },
                    { "label": "LVI- ja sähköhuolto", "tags": ["LVI", "sähköasennukset"] }
                ]
            }
        ]
    },
    "hautajaiset": {
        "title": "Hautajaiset",
        "icon": "🕯️",
        "description": "Arvokkaat ja huolelliset hautajaisjärjestelyt.",
        "steps": [
            {
                "id": "palvelu",
                "question": "Mitä palveluita tarvitset?",
                "options": [
                    { "label": "Hautauspalvelu", "tags": ["hautauspalvelu"] },
                    { "label": "Muistotilaisuus (tila)", "tags": ["juhlatila", "seurakunta"] },
                    { "label": "Pitopalvelu", "tags": ["pitopalvelu"] },
                    { "label": "Kukkakauppa", "tags": ["kukkakauppa"] }
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
                "question": "Hallinto ja suunnittelu",
                "options": [
                    { "label": "Yritysneuvonta / Konsultointi", "tags": ["yritysneuvonta", "konsultointi"] },
                    { "label": "Kirjanpito", "tags": ["tilitoimisto"] },
                    { "label": "Lakipalvelut", "tags": ["lakiasiaintoimistot"] },
                    { "label": "Vakuutukset", "tags": ["vakuutus"] }
                ]
            },
            {
                "id": "nakyvyys",
                "question": "Markkinointi ja näkyvyys",
                "options": [
                    { "label": "Verkkosivut / Mainostoimisto", "tags": ["verkkosivut", "mainostoimisto", "somemainonta", "google-mainonta"] },
                    { "label": "Brändäys / Logot", "tags": ["brändäys", "graafiset palvelut"] },
                    { "label": "Valokuvaus / Video", "tags": ["valokuvaus", "videotuotanto"] }
                ]
            },
            {
                "id": "tilat",
                "question": "Toimitilat ja IT",
                "options": [
                    { "label": "Toimitilat", "tags": ["toimitilat", "kiinteistönvälitys"] },
                    { "label": "IT-palvelut", "tags": ["it-palvelut"] }
                ]
            }
        ]
    },
    "yrityksen-kehittaminen": {
        "title": "Yrityksen kehittäminen",
        "icon": "📈",
        "description": "Vie yrityksesi seuraavalle tasolle.",
        "steps": [
            {
                "id": "markkinointi",
                "question": "Kasvata myyntiä",
                "options": [
                    { "label": "Digimarkkinointi / Google", "tags": ["google-mainonta", "somemainonta", "mainostoimisto"] },
                    { "label": "Verkkokaupan kehitys", "tags": ["verkkokauppa"] }
                ]
            },
            {
                "id": "osaaminen",
                "question": "Resurssit ja osaaminen",
                "options": [
                    { "label": "Henkilöstöpalvelut / Rekrytointi", "tags": ["henkilöstöpalvelut"] },
                    { "label": "Liikkeenjohdon konsultointi", "tags": ["konsultointi"] }
                ]
            }
        ]
    },
    "vakituinen-palvelukumppani": {
        "title": "Vakituinen palvelukumppani",
        "icon": "🤝",
        "description": "Etsitkö jatkuvaa sopimuskumppania?",
        "steps": [
            {
                "id": "alue",
                "question": "Millä osa-alueella?",
                "options": [
                    { "label": "IT ja tekniikka", "tags": ["it-palvelut", "vakiopalvelu"] },
                    { "label": "Siivous ja ylläpito", "tags": ["siivous", "kiinteistöhuolto", "vakiopalvelu"] },
                    { "label": "Hallinto / Talous", "tags": ["tilitoimisto", "isännöinti"] }
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
                "id": "huolto",
                "question": "Mitä palvelua etsit?",
                "options": [
                    { "label": "Kiinteistöhuolto", "tags": ["kiinteistöhuolto"] },
                    { "label": "Siivouspalvelut", "tags": ["siivous", "puhdistuspalvelut"] },
                    { "label": "Pihanhoito", "tags": ["viherrakentaminen"] }
                ]
            }
        ]
    },
    "paivystavat-palvelut": {
        "title": "Päivystävät palvelut",
        "icon": "🚨",
        "description": "Apu lähellä silloin kun sitä tarvitaan.",
        "steps": [
            {
                "id": "hata",
                "question": "Mitä on tapahtunut?",
                "options": [
                    { "label": "LVI-päivystys", "tags": ["LVI", "päivystys"] },
                    { "label": "Sähköpäivystys", "tags": ["sähköasennukset", "päivystys"] },
                    { "label": "Hinauspalvelu", "tags": ["hinaus"] },
                    { "label": "Lukitus / Avaimet", "tags": ["lukkoseppä", "päivystys"] }
                ]
            }
        ]
    }
};

const categoryIcons = {
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
    window.categoryIcons = categoryIcons;
    window.NEEDS_CONFIG = NEEDS_CONFIG;
}
