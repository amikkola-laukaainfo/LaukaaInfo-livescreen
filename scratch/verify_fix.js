
const companies = [
    { id: "company-272", nimi: "Rengaskanava Oy" },
    { id: "company-271", nimi: "Fenno optiikka" },
    { id: "company-2", nimi: "Mediazoo" }
];

function oldFilter(id_param) {
    const clean_id = id_param.replace('company-', '');
    return companies.filter(c => 
        c.id === id_param || 
        c.id === 'company-' + id_param || 
        c.id.includes(clean_id)
    );
}

function newFilter(id_param) {
    return companies.filter(c => 
        c.id === id_param || 
        c.id === 'company-' + id_param
    );
}

console.log("Requesting company-2");
console.log("Old logic matches:", oldFilter("company-2").map(c => c.nimi));
console.log("New logic matches:", newFilter("company-2").map(c => c.nimi));

console.log("\nRequesting 2");
console.log("Old logic matches:", oldFilter("2").map(c => c.nimi));
console.log("New logic matches:", newFilter("2").map(c => c.nimi));
