/**
 * generate_seo_pages.js
 * Generates static Directory & SEO layer HTML pages for LaukaaInfo.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { slugify, renderPlaceSeoPage, renderThemeSeoPage } = require('./seo_templates');

const SUPABASE_URL = 'https://duxluwyqxvbmkkjzuzkz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu';

/**
 * Default pilot places dataset (used if Supabase has not set seo_indexed=true yet)
 */
const PILOT_PLACES = [
    {
        id: "33333333-3333-4333-a333-333333333333",
        place_id: "vihtavuori",
        name: "Vihtavuori",
        description: "Vihtavuori on Laukaan keskeinen taajama ja perinteikäs teollisuus- sekä asuinalue, joka tunnetaan kauniista luonnostaan ja teollisesta historiastaan.",
        history_text: "Vihtavuoren kehitys liittyy vahvasti 1920-luvulla perustettuun ruutitehtaaseen, joka muodosti alueen teollisen selkärangan. Tänä päivänä Vihtavuori on elinvoimainen asuinalue, jossa yhdistyvät teollisuushistoria, modernit palvelut ja monipuoliset ulkoilureitit.",
        area: "Vihtavuori",
        seo_indexed: true,
        seo_slug: "vihtavuori",
        cover_image: "../hero-kuva.webp",
        secondary_links: [
            { label: "Vihtavuoren ruutitehdas", url: "../vihtavuori-ruutitehdas/", icon: "🏭" },
            { label: "Vuonteen Helmi (juhlatila)", url: "../../yritys/vuonteen-helmi.html", icon: "⭐" },
            { label: "Teollisuushistoria-teemasivu", url: "../../teemat/teollisuushistoria.html", icon: "⚙️" }
        ]
    },
    {
        id: "b3b3a0e1-4c12-4c63-b8e7-2c1b82a34567",
        place_id: "laukaan-satama",
        name: "Laukaan satama",
        seo_title: "Laukaan satama – Saraaveden rannalla | LaukaaInfo",
        description: "Laukaan satama sijaitsee kirkonkylässä Saraaveden rannalla. Satama-alue yhdistää vesillä liikkumisen, rannan ympäristön ja Laukaan keskustan läheiset palvelut. Se on luonteva lähtöpaikka vesistöön tutustumiseen ja yksi Laukaan tunnetuista rantakohteista.",
        history_text: "Saraaveden rannalla sijaitseva satama kuuluu Laukaan kirkonkylän vesistöympäristöön. Sataman ja sen lähiympäristön merkitys liittyy vesillä liikkumiseen, vapaa-aikaan ja rannan palveluihin. Alueeseen tutustuessa voi samalla tarkastella, mitä palveluja, tapahtumia ja muita kohteita sataman läheisyydestä löytyy.",
        area: "Laukaa Kirkonkylä",
        seo_indexed: true,
        seo_slug: "laukaan-satama",
        cover_image: "../laukaan_ravintolat_header.png",
        secondary_links: [
            { label: "Laukaan kirkonkylä", url: "../laukaan-kirkonkyla/", icon: "📍" },
            { label: "Laukaan ravintolat", url: "../../laukaan-ravintolat.html", icon: "🍽️" },
            { label: "Vesistöt ja veneily", url: "../../teemat/vesistot.html", icon: "⛵" }
        ]
    },
    {
        place_id: "haarlan-tehdashistoria",
        name: "Haarlan tehdashistoria",
        seo_title: "Haarlan tehdashistoria Lievestuoreella – teollisuusperintö ja tarinat | LaukaaInfo",
        description: "Haarlan selluloosatehtaan historia Lievestuoreella on merkittävä osa Laukaan ja Keski-Suomen teollisuusperintöä.",
        history_text: "Rafael Haarlan vuonna 1927 perustama selluloosatehdas Lievestuoreella oli vuosikymmenten ajan alueen merkittävin teollinen työllistäjä ja taajaman kehityksen moottori. Tehtaan vaiheet, kyläyhteisön elämä ja teollisuushistoria ovat keskeinen osa Lievestuoreen ja Laukaan identiteettiä.",
        area: "Lievestuore",
        seo_indexed: true,
        seo_slug: "haarlan-tehdashistoria",
        custom_interactive_url: "../../tietokortti.html?id=a7b96a02-f54e-4432-9e3b-a22bf1fcf043",
        custom_cta_text: "Avaa Haarlan tehdashistorian tietokortti",
        action_box_title: "Haarlan tehdashistorian tietokortti",
        action_box_desc: "Tutustu Haarlan selluloosatehtaan toimitukselliseen tietokorttiin LaukaaInfossa sekä Lievestuoreen muihin kohteisiin, kuten Haarlan rantaan.",
        action_box_cta: "Avaa tehdashistorian tietokortti",
        encounters_place_id: "11111111-1111-4111-a111-111111111111",
        highlight_box: {
            title: "📖 Haarlan selluloosatehtaan tietokortti",
            desc: "Haarlan sellutehtaan vaiheista, kyläyhteisöstä ja ympäristöhistoriasta on koottu syventävä toimituksellinen tietokortti LaukaaInfoon. Lähin virkistyskohde rannalla on Haarlan ranta ja urheilukenttä.",
            primary_btn: { text: "Avaa Haarlan tietokortti →", url: "../../tietokortti.html?id=a7b96a02-f54e-4432-9e3b-a22bf1fcf043" },
            secondary_btn: { text: "Haarlan ranta ja urheilukenttä →", url: "../../tietoa-paikasta.html?id=6df61792-3c94-412c-bbb7-0068c9c1a861" }
        },
        secondary_links: [
            { label: "Haarlan ranta ja urheilukenttä (lähin paikka)", url: "../../tietoa-paikasta.html?id=6df61792-3c94-412c-bbb7-0068c9c1a861", icon: "🏖️" },
            { label: "Lievestuore – Historia ja kulttuuriperintö", url: "../../teema.html?theme=historia&place=lievestuore", icon: "📜" },
            { label: "Teollisuushistoria -teemasivu", url: "../../teemat/teollisuushistoria.html", icon: "🏭" },
            { label: "Lievestuoreen taajama", url: "../lievestuore/", icon: "📍" }
        ]
    },
    {
        id: "55555555-5555-4555-a555-555555555510",
        place_id: "saraakallio",
        name: "Saraakallion kalliomaalaukset",
        description: "Pohjoismaiden laajin kalliomaalausalue Saraaveden rannalla Laukaassa. Saraakallion maalaukset ajoittuvat 5000–7000 vuoden taakse.",
        history_text: "Saraakallion kalliomaalaukset sisältävät yli 100 tunnistettua kuviohahmoa, kuten hirviä, ihmisiä ja veneitä. Ne kertovat kivikauden ihmisten elämästä, uskomuksista ja pyhistä paikoista.",
        area: "Laukaa Kirkonkylä",
        seo_indexed: true,
        seo_slug: "saraakallio",
        secondary_links: [
            { label: "Laukaan satama", url: "../laukaan-satama/", icon: "⚓" },
            { label: "Luonto ja retkeily", url: "../../teemat/luonto.html", icon: "🌲" },
            { label: "Historia ja kulttuuriperintö", url: "../../teemat/historia.html", icon: "📜" }
        ]
    },
    {
        id: "b04ed934-e927-42f9-9b40-1d7112a315f9",
        place_id: "peurunka",
        name: "Peurunka",
        description: "Monipuolinen matkailu-, kylpylä- ja hyvänolokeskus Peurunka-järven rannalla Laukaassa.",
        history_text: "Peurunka on toiminut vuosikymmeniä valtakunnallisesti tunnettuna kuntoutus- ja virkistyskeskuksena. Sen ympärillä on laajamuotoinen luonto- ja reittiverkosto.",
        area: "Peurunka",
        seo_indexed: true,
        seo_slug: "peurunka",
        secondary_links: [
            { label: "Peurungan luontoreitit", url: "../peurunka-luonto/", icon: "🌲" },
            { label: "Tekemistä perheille", url: "../../teemat/perheille.html", icon: "👨‍👩‍👧" },
            { label: "Luonto ja retkeily", url: "../../teemat/luonto.html", icon: "🥾" }
        ]
    },
    {
        place_id: "hitonhauta",
        name: "Hitonhauta",
        description: "Suosittu luontokohde ja vaikuttava rotkolaakso Laukaan Valkolassa.",
        history_text: "Jääkauden muovaama noin 800 metriä pitkä ja 10–20 metriä syvä rotkolaakso tarjoaa ainutlaatuisen luontoelämyksen ja jylhiä kallioseinämiä.",
        area: "Valkola",
        seo_indexed: true,
        seo_slug: "hitonhauta",
        custom_interactive_url: "../../kohdekartta.html",
        custom_cta_text: "Katso luontokohteet kartalla",
        action_box_title: "Hitonhauta ja Laukaan luonto",
        action_box_desc: "Tutustu Hitonhautaan ja Laukaan muihin upeisiin rotko- ja luontokohteisiin kartalla tai lue lisää Valkolan alueesta.",
        action_box_cta: "Avaa kohdekartta",
        secondary_links: [
            { label: "Valkolan kylätalo", url: "../../tietoa-paikasta.html?id=6c97b63e-2046-4827-b0de-07642468739f", icon: "🏡" },
            { label: "Luonto ja retkeily -teema", url: "../../teemat/luonto.html", icon: "🌲" }
        ]
    },
    {
        id: "55555555-5555-4555-a555-555555555511",
        place_id: "kuusankoski",
        name: "Kuusankoski ja Koskikara",
        description: "Kuusankoski on tunnettu perhokalastus- ja koskikohde Laukaassa, jonka rannalla sijaitsee legendaarinen Varjola ja Koskikara.",
        history_text: "Kuusankosken kuohut ovat vetäneet puoleensa kalastajia ja matkailijoita jo yli vuosisadan ajan. Alue muodostaa yhden Keiteleen reitin hienoimmista koskikokonaisuuksista.",
        area: "Kuusa",
        seo_indexed: true,
        seo_slug: "kuusankoski",
        secondary_links: [
            { label: "Varjola ja Koskikara", url: "../varjola/", icon: "🏡" },
            { label: "Vesistöt ja kalastus", url: "../../teemat/vesistot.html", icon: "🎣" }
        ]
    },
    {
        id: "11111111-1111-4111-a111-111111111111",
        place_id: "lievestuore",
        name: "Lievestuore",
        description: "Lievestuore on Laukaan itäinen taajama, joka tunnetaan Lievestuoreenjärvestä, teollisuushistoriastaan ja kirkkaasta yhdistystoiminnastaan.",
        history_text: "Lievestuore kehittyi radanvarren teollisuuspaikkakunnaksi 1900-luvun alussa. Tänä päivänä se tarjoaa monipuoliset asumismahdollisuudet ja luontoaktiviteetit.",
        area: "Lievestuore",
        seo_indexed: true,
        seo_slug: "lievestuore",
        secondary_links: [
            { label: "Haarlan tehdashistoria", url: "../haarlan-tehdashistoria/", icon: "🏭" },
            { label: "Haarlan ranta ja urheilukenttä", url: "../../tietoa-paikasta.html?id=6df61792-3c94-412c-bbb7-0068c9c1a861", icon: "🏖️" },
            { label: "Hyyppäänvuori", url: "../hyyppaanvuori/", icon: "⛰️" },
            { label: "Lievestuore – Historia ja kulttuuriperintö", url: "../../teema.html?theme=historia&place=lievestuore", icon: "📜" }
        ]
    },
    {
        id: "e14ec85b-4c80-45b7-9770-45f880da788e",
        place_id: "hyyppaanvuori",
        name: "Hyyppäänvuori",
        description: "Laukaan 'Koli' – jylhä kalliomaisema ja näköalapaikka Lievestuoreenjärven rannalla.",
        history_text: "Hyyppäänvuori nousee noin 160 metrin korkeuteen merenpinnasta tarjoten upeat näkymät yli Lievestuoreenjärven. Se on suosittu päiväretkikohde ja luontonähtävyys.",
        area: "Lievestuore",
        seo_indexed: true,
        seo_slug: "hyyppaanvuori",
        secondary_links: [
            { label: "Lievestuoreen taajama", url: "../lievestuore/", icon: "📍" },
            { label: "Luonto ja retkeily -teema", url: "../../teemat/luonto.html", icon: "🌲" }
        ]
    },
    {
        id: "cf684f56-790c-42a2-aa86-8cea505d4a4c",
        place_id: "tarvaala",
        name: "Tarvaalan kylä",
        seo_title: "Tarvaala – perinteikäs maaseutukylä ja kulttuurimaisema Laukaassa | LaukaaInfo",
        description: "Tarvaala on luonnonkaunis ja perinteikäs maaseutukylä Laukaassa Saraaveden ja Tarvaalanvirran rantamilla, tunnettu kyläyhteisöstään, Seuratalosta ja upeista järvimaisemistaan.",
        history_text: "Tarvaalan kylä Laukaassa muodostaa arvokkaan ja historiallisen maatalous- ja kulttuurimaisemakokonaisuuden. Alueella toimii aktiivinen kyläyhteisö, ja sen keskeisiä kohteita ovat Tarvaalan Seuratalo, suosittu Tallaanrannan uimaranta sekä ympäröivät maaseutu- ja vesistöreitit.",
        area: "Tarvaala",
        seo_indexed: true,
        seo_slug: "tarvaala",
        custom_interactive_url: "../../tietoa-paikasta.html?id=cf684f56-790c-42a2-aa86-8cea505d4a4c",
        custom_cta_text: "Avaa Tarvaalan kylän paikkasivu",
        action_box_title: "Tarvaalan kylä ja lähikohteet",
        action_box_desc: "Tutustu Tarvaalan kylän paikkasivuun, palveluihin ja lähialueen kohteisiin, kuten Seurataloon ja Tallaanrannan uimarantaan.",
        action_box_cta: "Avaa Tarvaalan paikkasivu",
        encounters_place_id: "cf684f56-790c-42a2-aa86-8cea505d4a4c",
        highlight_box: {
            title: "🏡 Tarvaalan kylä Laukaassa",
            desc: "Tarvaalaan on nyt oma kattava paikkasivu LaukaaInfossa. Kylän aktiivisia kohtaamispaikkoja ovat Tarvaalan Seuratalo sekä luonnonkaunis Tallaanrannan uimaranta Saraaveden rannalla.",
            primary_btn: { text: "Avaa Tarvaalan paikkasivu →", url: "../../tietoa-paikasta.html?id=cf684f56-790c-42a2-aa86-8cea505d4a4c" },
            secondary_btn: { text: "Tarvaalan Seuratalo →", url: "../../tietoa-paikasta.html?id=e8899a18-6e4d-4bbb-b003-3a5ff2e3f921" }
        },
        secondary_links: [
            { label: "Tarvaalan Seuratalo", url: "../../tietoa-paikasta.html?id=e8899a18-6e4d-4bbb-b003-3a5ff2e3f921", icon: "🏛️" },
            { label: "Tarvaalan uimaranta (Tallaanranta)", url: "../../tietoa-paikasta.html?id=2ad826da-752d-46b5-8111-aba1a9ad18c7", icon: "🏖️" },
            { label: "Luonto ja retkeily Tarvaalassa", url: "../../teema.html?theme=luonto&place=tarvaala", icon: "🌲" }
        ]
    },
    {
        id: "ec7beb8e-017a-49ea-83df-f22f78c777db",
        place_id: "laukaan-kirkko",
        name: "Laukaan kirkko",
        seo_title: "Laukaan kirkko – Keski-Suomen vanhin kivikirkko | LaukaaInfo",
        description: "Laukaan harmaakivikirkko on Keski-Suomen vanhin kirkkorakennus, joka on toiminut seurakunnan sydämenä keskiajalta lähtien.",
        history_text: "Laukaan kivikirkko rakennettiin 1400-luvulla ja se on yksi Keski-Suomen arvostetuimmista kulttuurihistoriallisista kohteista. Kirkko ympäristöineen muodostaa ikiaikaisen kokonaisuuden Laukaan kirkonkylässä.",
        area: "Laukaa Kirkonkylä",
        seo_indexed: true,
        seo_slug: "laukaan-kirkko",
        secondary_links: [
            { label: "Laukaan kirkonkylä", url: "../laukaan-kirkonkyla/", icon: "📍" },
            { label: "Historia ja kulttuuriperintö", url: "../../teemat/historia.html", icon: "📜" }
        ]
    },
    {
        id: "44444444-4444-4444-a444-444444444444",
        place_id: "leppavesi",
        name: "Leppävesi",
        seo_title: "Leppävesi – rauhallinen ranta-taajama Laukaassa | LaukaaInfo",
        description: "Leppävesi on idyllinen taajama Leppäveden rannalla, jota ympäröivät metsät, veneilyreitit ja maalaismaisema.",
        history_text: "Leppävesi kehittyi rautatieyhteyden myötä ja on tänä päivänä suosittu asuinalue lähellä Jyväskylää, säilyttäen silti maaseutumaisen luonteensa.",
        area: "Leppävesi",
        seo_indexed: true,
        seo_slug: "leppavesi",
        secondary_links: [
            { label: "Leppäveden liikuntapuisto", url: "../../tietoa-paikasta.html?id=19872c5f-b27e-4d6d-a821-8e75486a3627", icon: "⚽" },
            { label: "Koko Laukaan kohteet", url: "../../laukaa.html", icon: "📍" }
        ]
    },
    {
        id: "66666666-6666-4666-a666-666666666666",
        place_id: "vehnia",
        name: "Vehniä",
        seo_title: "Vehniä – maaseutukylä Laukaan pohjoisosassa | LaukaaInfo",
        description: "Vehniä on rauhallinen maaseutukylä Laukaan pohjoisosassa, joka tunnetaan peltoaukeistaan, kyläyhteisöstään ja perinteisestä maaseutumaisemastaan.",
        history_text: "Vehniä on vanha maatalouskylä, jonka historia ulottuu kauas. Nykyään se tarjoaa rauhallisen asuinympäristön hyvien yhteyksien varrella.",
        area: "Vehniä",
        seo_indexed: true,
        seo_slug: "vehnia",
        secondary_links: [
            { label: "Koko Laukaan kohteet", url: "../../laukaa.html", icon: "📍" },
            { label: "Luonto ja retkeily", url: "../../teemat/luonto.html", icon: "🌲" }
        ]
    },
    {
        id: "55555555-5555-4555-a555-555555555555",
        place_id: "laukaan-uimahalli",
        name: "Laukaan uimahalli",
        seo_title: "Laukaan uimahalli – perheille ja liikkujille | LaukaaInfo",
        description: "Laukaan uimahalli on koko perheen liikuntapaikka, jossa on uima-allas, lasten allas ja saunaoastot.",
        history_text: "Uimahalli on palvellut laukaalaisperheitä jo vuosikymmeniä ja on keskeinen kokoontumispaikka kirkonkylässä.",
        area: "Laukaa Kirkonkylä",
        seo_indexed: true,
        seo_slug: "laukaan-uimahalli",
        custom_interactive_url: "../../palvelu.html?id=liikunta-ja-vapaaaika",
        custom_cta_text: "Avaa liikuntapalvelut",
        secondary_links: [
            { label: "Laukaan kirkonkylä", url: "../laukaan-kirkonkyla/", icon: "📍" },
            { label: "Tekemistä perheille", url: "../../teemat/perheille.html", icon: "👨‍👩‍👧" }
        ]
    },
    {
        id: "33333333-3333-4333-a333-333333333333",
        place_id: "vihtavuori-ruutitehdas",
        name: "Vihtavuoren ruutitehdas",
        seo_title: "Vihtavuoren ruutitehdas – teollisuushistorian merkkipaikka | LaukaaInfo",
        description: "Vihtavuoren ruutitehdas on Suomen puolustushistorian kannalta merkittävä laitos, joka on toiminut Laukaassa 1920-luvulta asti.",
        history_text: "Vuonna 1923 perustettu Vihtavuoren räjähdysainetehdas (nykyinen Nammo Finland Oy) on Suomen puolustusvoimien ja kotimaisen teollisuuden peruspilari. Laitos sijaitsee ainutlaatuisessa metsäisessä ympäristössä ja on osa Vihtavuoren taajaman identiteettiä.",
        area: "Vihtavuori",
        seo_indexed: true,
        seo_slug: "vihtavuori-ruutitehdas",
        secondary_links: [
            { label: "Vihtavuoren taajama", url: "../vihtavuori/", icon: "📍" },
            { label: "Teollisuushistoria -teema", url: "../../teemat/teollisuushistoria.html", icon: "🏭" },
            { label: "Vuonteen Helmi -juhlapaikka", url: "../../yritys/vuonteen-helmi.html", icon: "⭐" }
        ]
    },
    {
        id: "b04ed934-e927-42f9-9b40-1d7112a315f9",
        place_id: "peurunka-luonto",
        name: "Peurungan luontoreitit",
        seo_title: "Peurungan luontoreitit – vaellus ja retkeily Laukaassa | LaukaaInfo",
        description: "Peurungan ympäristössä on laaja luontoreitti- ja vaellusverkosto järvimaisemassa.",
        history_text: "Peurungan ympäristön luontoreitit kulkevat rehevien metsien, harjujen ja järvimaisemien halki. Reitit sopivat kaikenikäisille liikkujille.",
        area: "Peurunka",
        seo_indexed: true,
        seo_slug: "peurunka-luonto",
        secondary_links: [
            { label: "Kylpylähotelli Peurunka", url: "../peurunka/", icon: "🏨" },
            { label: "Luonto ja retkeily -teema", url: "../../teemat/luonto.html", icon: "🌲" }
        ]
    },
    {
        id: "55555555-5555-4555-a555-555555555555",
        place_id: "laukaan-kirkonkyla",
        name: "Laukaan kirkonkylä",
        seo_title: "Laukaan kirkonkylä – kunnan sydän Saraaveden rannalla | LaukaaInfo",
        description: "Laukaan kirkonkylä on kunnan hallinnollinen keskus, jossa sijaitsevat palvelut, kirkko, satama ja kulttuurihistorialliset kohteet.",
        history_text: "Laukaan kirkonkylä on toiminut alueen keskuksena jo vuosisatoja. Se sijaitsee Saraaveden rannalla ja yhdistää luonnonläheisyyden, palvelut ja historian.",
        area: "Laukaa Kirkonkylä",
        seo_indexed: true,
        seo_slug: "laukaan-kirkonkyla",
        secondary_links: [
            { label: "Laukaan satama", url: "../laukaan-satama/", icon: "⚓" },
            { label: "Laukaan kirkko", url: "../laukaan-kirkko/", icon: "⛪" },
            { label: "Laukaan tori", url: "../laukaan-tori/", icon: "🛍️" }
        ]
    },
    {
        id: "55555555-5555-4555-a555-555555555511",
        place_id: "varjola",
        name: "Varjola ja Koskikara",
        seo_title: "Varjola ja Koskikara – kalastajanelämää Kuusankoskella | LaukaaInfo",
        description: "Varjola Farm ja Koskikara ovat luonnonläheisiä kohtaamis- ja elämyspaikkoja Kuusankosken rannalla Laukaassa.",
        history_text: "Varjola on toiminut pitkään maatilamatkailun ja tapahtumien pitopaikkana. Koskikara puolestaan on kalastukseen erikoistunut leirikeskus ainutlaatuisella koskipaikalla.",
        area: "Kuusa",
        seo_indexed: true,
        seo_slug: "varjola",
        secondary_links: [
            { label: "Kuusankoski ja Koskikara", url: "../kuusankoski/", icon: "🌊" },
            { label: "Vesistöt ja kalastus", url: "../../teemat/vesistot.html", icon: "🎣" }
        ]
    },
    {
        id: "55555555-5555-4555-a555-555555555555",
        place_id: "laukaan-tori",
        name: "Laukaan tori",
        seo_title: "Laukaan tori – kirkonkylän kohtaamispaikka | LaukaaInfo",
        description: "Laukaan tori on kirkonkylän perinteinen kohtaamispaikka, jossa järjestetään torielämää, tapahtumia ja markkinoita.",
        history_text: "Laukaan tori on ollut kirkonkylän yhteisöllinen sydän jo pitkään. Siellä kohtaavat paikalliset asukkaat, yrittäjät ja tapahtumat ympäri vuoden.",
        area: "Laukaa Kirkonkylä",
        seo_indexed: true,
        seo_slug: "laukaan-tori",
        secondary_links: [
            { label: "Laukaan kirkonkylä", url: "../laukaan-kirkonkyla/", icon: "📍" },
            { label: "Laukaan satama", url: "../laukaan-satama/", icon: "⚓" },
            { label: "Ajankohtaista ja tapahtumat", url: "../../ajankohtaista.html", icon: "📅" }
        ]
    }
];

/**
 * Default pilot themes dataset
 */
const PILOT_THEMES = [
    {
        id: "luonto",
        name: "Luonto ja retkeily",
        description: "Laukaan ainutlaatuiset luontokohteet, kalliomaalaukset, kosket, luontopolut ja vesistöt.",
        seo_indexed: true,
        seo_slug: "luonto"
    },
    {
        id: "historia",
        name: "Historia ja kulttuuriperintö",
        description: "Laukaan rikas historia aina kivikauden kalliomaalauksista teollisuusajan muistoihin ja kulttuurireitteihin.",
        seo_indexed: true,
        seo_slug: "historia"
    },
    {
        id: "teollisuushistoria",
        name: "Teollisuushistoria",
        description: "Vihtavuoren ruutitehdas, Haarlan tehtaat ja Laukaan vaiherikas teollisuusperintö.",
        seo_indexed: true,
        seo_slug: "teollisuushistoria"
    },
    {
        id: "perheille",
        name: "Tekemistä perheille",
        description: "Lapsiperheille sopivat uimarannat, leikkipuistot, retkikohteet ja vapaa-ajan elämykset Laukaassa.",
        seo_indexed: true,
        seo_slug: "perheille"
    },
    {
        id: "vesistot",
        name: "Vesistöt ja veneily",
        description: "Saraavesi, Peurunka, Lievestuoreenjärvi, Kuusankoski ja Keiteleen kanava – Laukaan upeat vesireitit.",
        seo_indexed: true,
        seo_slug: "vesistot"
    }
];

function fetchSupabase(path) {
    return new Promise((resolve) => {
        const options = {
            hostname: new URL(SUPABASE_URL).hostname,
            path: path,
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Accept': 'application/json'
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(Array.isArray(parsed) ? parsed : null);
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(5000, () => { req.destroy(); resolve(null); });
        req.end();
    });
}

async function generateSeoPages() {
    console.log('====================================================');
    console.log('🚀 Launching LaukaaInfo SEO & Directory Generator...');
    console.log('====================================================');

    const rootDir = __dirname;
    const paikkaDir = path.join(rootDir, 'paikka');
    const teematDir = path.join(rootDir, 'teemat');

    // Create directories if not existing
    if (!fs.existsSync(paikkaDir)) fs.mkdirSync(paikkaDir, { recursive: true });
    if (!fs.existsSync(teematDir)) fs.mkdirSync(teematDir, { recursive: true });

    // 1. Fetch Places from Supabase (or fallback to PILOT_PLACES)
    console.log('📡 Fetching place data...');
    let dbPlaces = await fetchSupabase('/rest/v1/places?select=*&seo_indexed=eq.true');
    
    let placesToGenerate = [];
    if (dbPlaces && dbPlaces.length > 0) {
        console.log(`✓ Found ${dbPlaces.length} places marked with seo_indexed=true in Supabase.`);
        placesToGenerate = dbPlaces;
    } else {
        console.log(`ℹ Using pilot places dataset (${PILOT_PLACES.length} places).`);
        placesToGenerate = PILOT_PLACES;
    }

    // 2. Fetch Themes from Supabase (or fallback to PILOT_THEMES)
    console.log('📡 Fetching theme data...');
    let dbThemes = await fetchSupabase('/rest/v1/tags?select=*&seo_indexed=eq.true');
    let themesToGenerate = [];
    if (dbThemes && dbThemes.length > 0) {
        console.log(`✓ Found ${dbThemes.length} themes marked with seo_indexed=true in Supabase.`);
        themesToGenerate = dbThemes;
    } else {
        console.log(`ℹ Using pilot themes dataset (${PILOT_THEMES.length} themes).`);
        themesToGenerate = PILOT_THEMES;
    }

    // 3. Generate Place HTML Pages (/paikka/[slug]/index.html & /kohteet/[slug].html)
    console.log('\n📄 Generating place SEO pages (/paikka/...)...');
    let placeCount = 0;
    placesToGenerate.forEach(place => {
        const slug = place.seo_slug || slugify(place.name);
        if (!slug) return;

        // Find matching themes for this place
        const placeArea = place.area || place.municipality || 'Laukaa';
        const relatedThemes = PILOT_THEMES.filter(t => 
            place.description && place.description.toLowerCase().includes(t.name.toLowerCase()) ||
            place.name.toLowerCase().includes('tehdas') && t.id === 'teollisuushistoria' ||
            t.id === 'luonto'
        );

        const html = renderPlaceSeoPage({
            place,
            relatedThemes,
            relatedRoutes: [],
            relatedStories: [],
            placeImages: [],
            areaName: placeArea
        });

        // Puhdas URL-muoto: /paikka/[slug]/index.html
        const placeSubDir = path.join(paikkaDir, slug);
        if (!fs.existsSync(placeSubDir)) fs.mkdirSync(placeSubDir, { recursive: true });
        fs.writeFileSync(path.join(placeSubDir, 'index.html'), html, 'utf8');

        console.log(`   + Created: /paikka/${slug}/ (${place.name})`);
        placeCount++;
    });

    // 4. Generate Theme HTML Pages (/teemat/*.html)
    console.log('\n📄 Generating theme SEO pages (/teemat/)...');
    let themeCount = 0;
    themesToGenerate.forEach(theme => {
        const slug = theme.seo_slug || slugify(theme.name);
        if (!slug) return;

        // Find matching places for this theme
        const relatedPlaces = placesToGenerate.filter(p => {
            if (theme.id === 'teollisuushistoria' && (p.name.includes('Vihtavuori') || p.name.includes('tehdas') || p.name.includes('Lievestuore'))) return true;
            if (theme.id === 'luonto' && (p.name.includes('Hitonhauta') || p.name.includes('Saraakallio') || p.name.includes('Peurunka') || p.name.includes('Hyyppäänvuori'))) return true;
            if (theme.id === 'vesistot' && (p.name.includes('Satama') || p.name.includes('Kuusankoski') || p.name.includes('Saraakallio'))) return true;
            return true;
        }).slice(0, 6);

        const html = renderThemeSeoPage({
            theme,
            relatedPlaces,
            relatedRoutes: [],
            relatedStories: []
        });

        const filePath = path.join(teematDir, `${slug}.html`);
        fs.writeFileSync(filePath, html, 'utf8');
        console.log(`   + Created: /teemat/${slug}.html (${theme.name})`);
        themeCount++;
    });

    // 5. Update sitemap.xml – merge existing static URLs + generated paikka & teemat pages
    console.log('\n📍 Updating sitemap.xml...');
    const today = new Date().toISOString().split('T')[0] + 'T00:00:00+00:00';
    const sitemapPath = path.join(rootDir, 'sitemap.xml');

    // Static core pages (preserved as-is, /kohteet/ replaced by /paikka/)
    const staticUrls = [
        { loc: 'https://laukaainfo.fi/', priority: '1.00' },
        { loc: 'https://laukaainfo.fi/index.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/alueet.html', priority: '0.90', changefreq: 'weekly' },
        { loc: 'https://laukaainfo.fi/wonderin/esittely.html', priority: '0.85', changefreq: 'monthly' },
        { loc: 'https://laukaainfo.fi/tapahtumakartta.html', priority: '0.85', changefreq: 'daily' },
        { loc: 'https://laukaainfo.fi/palvelun-esittely.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/ilmoittaudu.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/kauppa.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/lisaa-yritys.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/laukaa.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/leppavesi.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/lievestuore.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/vehnia.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/vihtavuori.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/koko-laukaa.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/ajankohtaista.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/asiahaku.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/kohdekartta.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/tarinakartta.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/muistokartta.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/tilannekuva.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/reitti.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/reitti-partner.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/kadonneet.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/ilmoitukset.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/pikahaku.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/keskustelu.html', priority: '0.75' },
        { loc: 'https://laukaainfo.fi/toiminta.html', priority: '0.75' },
        { loc: 'https://laukaainfo.fi/kohtaamiset.html', priority: '0.75' },
        { loc: 'https://laukaainfo.fi/galleria.html', priority: '0.75' },
        { loc: 'https://laukaainfo.fi/yhteisot-ja-linkit.html', priority: '0.75' },
        { loc: 'https://laukaainfo.fi/laukaan-ravintolat.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/laukaan-autohuollot.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/laukaan-parturit-ja-kauneus.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/tietoa-paikasta.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/laatu.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/tietosuoja.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/maksuehto.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/seina-esittely.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/alusta.html', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/pikahaku.html?id=vuokrauspalvelut', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=haat', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=yritysjuhlat', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=yritystilaisuudet', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=syntymapaivat', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=muutto', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=remontti', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=mokkipalvelut', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=hautajaiset', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=yrityksen-perustaminen', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=yrityksen-kehittaminen', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=vakituinen-palvelukumppani', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=kiinteistopalvelut', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=paivystavat-palvelut', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=terveys-ja-hyvinvointi', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=liikunta-ja-vapaaaika', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=elaimet', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=lapset-ja-perhe', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/palvelu.html?id=autohuollot', priority: '0.80' },
        { loc: 'https://laukaainfo.fi/paikka/', priority: '0.95' },   // hakemisto
        { loc: 'https://laukaainfo.fi/yritys/terveys-ja-hyvinvointipalvelu-riina-raitio.html', priority: '0.90' },
        { loc: 'https://laukaainfo.fi/yritys/vuonteen-helmi.html', priority: '0.90' },
        { loc: 'https://laukaainfo.fi/yritys/mediazoo.html', priority: '0.90' },
        { loc: 'https://laukaainfo.fi/yritys/keski-suomen-parvekelasitus-oy.html', priority: '0.90' }
    ];

    // Dynamic paikka pages
    const paikkaUrls = placesToGenerate.map(p => ({
        loc: `https://laukaainfo.fi/paikka/${p.seo_slug || slugify(p.name)}/`,
        priority: '0.90',
        changefreq: 'weekly'
    }));

    // Dynamic teemat pages
    const teematUrls = themesToGenerate.map(t => ({
        loc: `https://laukaainfo.fi/teemat/${t.seo_slug || slugify(t.name)}.html`,
        priority: '0.90',
        changefreq: 'monthly'
    }));

    const allUrls = [...staticUrls, ...paikkaUrls, ...teematUrls];

    const urlEntries = allUrls.map(u => {
        const cf = u.changefreq ? `\n  <changefreq>${u.changefreq}</changefreq>` : '';
        return `<url>\n  <loc>${u.loc}</loc>\n  <lastmod>${today}</lastmod>${cf}\n  <priority>${u.priority}</priority>\n</url>`;
    }).join('\n');

    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
<!-- Generated by LaukaaInfo SEO Generator – ${new Date().toISOString()} -->

${urlEntries}

</urlset>
`;
    fs.writeFileSync(sitemapPath, sitemapXml, 'utf8');
    console.log(`   ✓ sitemap.xml updated: ${allUrls.length} URLs (${paikkaUrls.length} paikka + ${teematUrls.length} teemat + ${staticUrls.length} static)`);

    console.log('\n====================================================');
    console.log(`✅ SEO Generation Complete!`);
    console.log(`   - Generated ${placeCount} Place pages in /paikka/`);
    console.log(`   - Generated ${themeCount} Theme pages in /teemat/`);
    console.log(`   - sitemap.xml updated with ${allUrls.length} URLs`);
    console.log('====================================================\n');
}

if (require.main === module) {
    generateSeoPages().catch(err => {
        console.error('❌ SEO Generation failed:', err);
    });
}

module.exports = { generateSeoPages };
