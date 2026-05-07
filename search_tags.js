const SEARCH_TAG_LIST = [
    // 🏗️ Rakentaminen ja kiinteistöt
    { term: "rakentaminen", category: "Rakentaminen ja kiinteistöt" },
    { term: "rakennussuunnittelu", category: "Rakentaminen ja kiinteistöt" },
    { term: "rakennustarvikkeet", category: "Rakentaminen ja kiinteistöt" },
    { term: "rakennuskonevuokraus", category: "Rakentaminen ja kiinteistöt" },
    { term: "maanrakennus", category: "Rakentaminen ja kiinteistöt" },
    { term: "maalaustyöt", category: "Rakentaminen ja kiinteistöt" },
    { term: "lattiatyöt", category: "Rakentaminen ja kiinteistöt" },
    { term: "lasityöt", category: "Rakentaminen ja kiinteistöt" },
    { term: "peltityöt", category: "Rakentaminen ja kiinteistöt" },
    { term: "muurari", category: "Rakentaminen ja kiinteistöt" },
    { term: "hirsirakentaminen", category: "Rakentaminen ja kiinteistöt" },
    { term: "viherrakentaminen", category: "Rakentaminen ja kiinteistöt" },
    { term: "pihasuunnittelu", category: "Rakentaminen ja kiinteistöt" },
    { term: "kiinteistöhuolto", category: "Rakentaminen ja kiinteistöt" },
    { term: "kiinteistönvälitys", category: "Rakentaminen ja kiinteistöt" },
    { term: "isännöinti", category: "Rakentaminen ja kiinteistöt" },
    { term: "vastaava työnjohtaja", category: "Rakentaminen ja kiinteistöt" },

    // 🔧 Huolto, korjaus ja tekniset palvelut
    { term: "autokorjaamot", category: "Huolto, korjaus ja tekniset palvelut" },
    { term: "automaalaamo", category: "Huolto, korjaus ja tekniset palvelut" },
    { term: "autotarvikkeet", category: "Huolto, korjaus ja tekniset palvelut" },
    { term: "pienkonehuolto", category: "Huolto, korjaus ja tekniset palvelut" },
    { term: "pienkonekorjaus", category: "Huolto, korjaus ja tekniset palvelut" },
    { term: "antennihuolto", category: "Huolto, korjaus ja tekniset palvelut" },
    { term: "sähköasennukset", category: "Huolto, korjaus ja tekniset palvelut" },
    { term: "sähkösuunnittelu", category: "Huolto, korjaus ja tekniset palvelut" },
    { term: "LVI", category: "Huolto, korjaus ja tekniset palvelut" },
    { term: "kylmätyö", category: "Huolto, korjaus ja tekniset palvelut" },
    { term: "öljypoltinhuolto", category: "Huolto, korjaus ja tekniset palvelut" },
    { term: "nuohouspalvelut", category: "Huolto, korjaus ja tekniset palvelut" },
    { term: "huoltoasema", category: "Huolto, korjaus ja tekniset palvelut" },

    // 🚗 Liikenne ja kuljetus
    { term: "autokauppa", category: "Liikenne ja kuljetus" },
    { term: "autokoulu", category: "Liikenne ja kuljetus" },
    { term: "taksi", category: "Liikenne ja kuljetus" },
    { term: "kuljetusliike", category: "Liikenne ja kuljetus" },
    { term: "hinaus", category: "Liikenne ja kuljetus" },
    { term: "rengasliike", category: "Liikenne ja kuljetus" },
    { term: "katsastus", category: "Liikenne ja kuljetus" },
    { term: "matkahuolto", category: "Liikenne ja kuljetus" },
    { term: "sairaanhoito", category: "Liikenne ja kuljetus" },
    { term: "sairaankuljetus", category: "Liikenne ja kuljetus" },

    // 🏭 Teollisuus ja tuotanto
    { term: "metallituotteet", category: "Teollisuus ja tuotanto" },
    { term: "muovituotevalmistus", category: "Teollisuus ja tuotanto" },
    { term: "puusepänteollisuus", category: "Teollisuus ja tuotanto" },
    { term: "veneveistämö", category: "Teollisuus ja tuotanto" },

    // 🌲 Maa- ja metsätalous
    { term: "maataloustuotteet", category: "Maa- ja metsätalous" },
    { term: "maaseutupalvelut", category: "Maa- ja metsätalous" },
    { term: "luomutuotanto", category: "Maa- ja metsätalous" },
    { term: "metsätalous", category: "Maa- ja metsätalous" },
    { term: "metsänhoitotyöt", category: "Maa- ja metsätalous" },
    { term: "metsäkoneurakointi", category: "Maa- ja metsätalous" },

    // 🛒 Kauppa ja myymälät
    { term: "päivittäistavarakauppa", category: "Kauppa ja myymälät" },
    { term: "kioski", category: "Kauppa ja myymälät" },
    { term: "kirpputori", category: "Kauppa ja myymälät" },
    { term: "kangaskaupat", category: "Kauppa ja myymälät" },
    { term: "rautakauppa", category: "Kauppa ja myymälät" },
    { term: "puutavaraliike", category: "Kauppa ja myymälät" },
    { term: "saha", category: "Kauppa ja myymälät" },
    { term: "kodinkoneet", category: "Kauppa ja myymälät" },
    { term: "sähkötarvikkeet", category: "Kauppa ja myymälät" },
    { term: "toimistotarvikkeet", category: "Kauppa ja myymälät" },
    { term: "vaatetusliike", category: "Kauppa ja myymälät" },
    { term: "venetarvikkeet", category: "Kauppa ja myymälät" },
    { term: "askartelutarvikkeet", category: "Kauppa ja myymälät" },
    { term: "käsityöt", category: "Kauppa ja myymälät" },
    { term: "lahjatavarat", category: "Kauppa ja myymälät" },

    // 🍽️ Ravintolat ja palvelut
    { term: "kahvilat", category: "Ravintolat ja palvelut" },
    { term: "ravintolat", category: "Ravintolat ja palvelut" },
    { term: "pitopalvelu", category: "Ravintolat ja palvelut" },
    { term: "majoitus", category: "Ravintolat ja palvelut" },
    { term: "kokoustilat", category: "Ravintolat ja palvelut" },
    { term: "juhlatilat", category: "Ravintolat ja palvelut" },
    { term: "pikkujoulut", category: "Ravintolat ja palvelut" },
    { term: "pikkujoulu", category: "Ravintolat ja palvelut" },

    // 💻 Yritys- ja asiantuntijapalvelut
    { term: "tilitoimisto", category: "Yritys- ja asiantuntijapalvelut" },
    { term: "lakiasiaintoimistot", category: "Yritys- ja asiantuntijapalvelut" },
    { term: "konsultointi", category: "Yritys- ja asiantuntijapalvelut" },
    { term: "mainostoimisto", category: "Yritys- ja asiantuntijapalvelut" },
    { term: "mainonta", category: "Yritys- ja asiantuntijapalvelut" },
    { term: "mainostuotteet", category: "Yritys- ja asiantuntijapalvelut" },
    { term: "graafiset palvelut", category: "Yritys- ja asiantuntijapalvelut" },
    { term: "tulkkauspalvelut", category: "Yritys- ja asiantuntijapalvelut" },

    // 🧑⚕️ Terveys ja hyvinvointi
    { term: "lääkäripalvelut", category: "Terveys ja hyvinvointi" },
    { term: "terveyspalvelut", category: "Terveys ja hyvinvointi" },
    { term: "sairaala", category: "Terveys ja hyvinvointi" },
    { term: "hammashoito", category: "Terveys ja hyvinvointi" },
    { term: "eläinlääkäri", category: "Terveys ja hyvinvointi" },
    { term: "fysikaalinen hoito", category: "Terveys ja hyvinvointi" },
    { term: "akupunktio", category: "Terveys ja hyvinvointi" },
    { term: "hieroja", category: "Terveys ja hyvinvointi" },
    { term: "jalkahoito", category: "Terveys ja hyvinvointi" },
    { term: "kauneushoitola", category: "Terveys ja hyvinvointi" },
    { term: "kosmetiikka", category: "Terveys ja hyvinvointi" },
    { term: "hyvinvointi", category: "Terveys ja hyvinvointi" },

    // 🧑🤝🧑 Henkilökohtaiset palvelut
    { term: "kampaamot", category: "Henkilökohtaiset palvelut" },
    { term: "parturit", category: "Henkilökohtaiset palvelut" },
    { term: "ompelutyöt", category: "Henkilökohtaiset palvelut" },
    { term: "pesupalvelut", category: "Henkilökohtaiset palvelut" },
    { term: "puhdistuspalvelut", category: "Henkilökohtaiset palvelut" },
    { term: "kotipalvelut", category: "Henkilökohtaiset palvelut" },
    { term: "lemmikkihoitola", category: "Henkilökohtaiset palvelut" },
    { term: "hevostenhoito", category: "Henkilökohtaiset palvelut" },
    { term: "personal trainer", category: "Henkilökohtaiset palvelut" },

    // 🎨 Vapaa-aika ja kulttuuri
    { term: "elokuvateatteri", category: "Vapaa-aika ja kulttuuri" },
    { term: "kuntosali", category: "Vapaa-aika ja kulttuuri" },
    { term: "ratsastus", category: "Vapaa-aika ja kulttuuri" },
    { term: "kalastus", category: "Vapaa-aika ja kulttuuri" },
    { term: "kuvataide", category: "Vapaa-aika ja kulttuuri" },
    { term: "kuvanveisto", category: "Vapaa-aika ja kulttuuri" },
    { term: "kehystys", category: "Vapaa-aika ja kulttuuri" },

    // 🏢 Julkiset ja yhteiskunnalliset palvelut
    { term: "kirjasto", category: "Julkiset ja yhteiskunnalliset palvelut" },
    { term: "posti", category: "Julkiset ja yhteiskunnalliset palvelut" },
    { term: "seurakunta", category: "Julkiset ja yhteiskunnalliset palvelut" },
    { term: "virasto", category: "Julkiset ja yhteiskunnalliset palvelut" },
    { term: "osuuskunta", category: "Julkiset ja yhteiskunnalliset palvelut" },
    { term: "palo- ja pelastustoimi", category: "Julkiset ja yhteiskunnalliset palvelut" },

    // 🔒 Turvallisuus ja valvonta
    { term: "vartiointipalvelu", category: "Turvallisuus ja valvonta" },
    { term: "vakuutus", category: "Turvallisuus ja valvonta" },

    // ⚡ Energia ja infrastruktuuri
    { term: "sähkön myynti", category: "Energia ja infrastruktuuri" },
    { term: "varastointi", category: "Energia ja infrastruktuuri" },

    // 🪵 Muut palvelut
    { term: "polttopuut", category: "Muut palvelut" },
    { term: "puutavarakuljetus", category: "Muut palvelut" },
    { term: "puutarha", category: "Muut palvelut" },
    { term: "siirtolapuutarha", category: "Muut palvelut" },
    { term: "nostopalvelut", category: "Muut palvelut" },
    { term: "ohjelmapalvelut", category: "Muut palvelut" },
    { term: "verkkokauppa", category: "Muut palvelut" },
    { term: "valokuvaus", category: "Muut palvelut" },
    { term: "sanomalehti", category: "Muut palvelut" },
    { term: "hautauspalvelu", category: "Muut palvelut" },
    { term: "hautajaiset", category: "Muut palvelut" },

    // ⚽ Liikunta ja vapaa-aika
    { term: "uinti", category: "Liikunta ja vapaa-aika" },
    { term: "uimahalli", category: "Liikunta ja vapaa-aika" },
    { term: "kylpylä", category: "Liikunta ja vapaa-aika" },
    { term: "huvipuisto", category: "Liikunta ja vapaa-aika" },
    { term: "koskenlasku", category: "Liikunta ja vapaa-aika" },
    { term: "golf", category: "Liikunta ja vapaa-aika" },
    { term: "kuntosali", category: "Liikunta ja vapaa-aika" },
    { term: "ratsastus", category: "Liikunta ja vapaa-aika" },
    { term: "retkeily", category: "Liikunta ja vapaa-aika" },
    { term: "ulkoilu", category: "Liikunta ja vapaa-aika" }
];
