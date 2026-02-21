document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Map
    const map = L.map('tarina-map').setView([62.336, 26.046], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    let storySteps = [];
    let currentStepIndex = 0;
    let markers = [];
    let polyline = null;

    // Elements
    const stepTitle = document.getElementById('step-title');
    const stepCounter = document.getElementById('step-counter');
    const stepDescription = document.getElementById('step-description');
    const stepImage = document.getElementById('step-image');
    const imagePlaceholder = document.getElementById('image-placeholder');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    // 2. Fetch Story Data
    Papa.parse('tarinakartta_data.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            storySteps = results.data.sort((a, b) => parseInt(a.step_order) - parseInt(b.step_order));
            if (storySteps.length > 0) {
                initStory();
            }
        },
        error: function (err) {
            console.error('Virhe tarinadatan latauksessa:', err);
            stepTitle.textContent = "Virhe datan latauksessa";
        }
    });

    function initStory() {
        // Create all markers but hide them initially or show step numbers?
        // For story map, let's show all markers with numbers
        const pathCoords = [];

        storySteps.forEach((step, index) => {
            const lat = parseFloat(step.lat);
            const lng = parseFloat(step.lng);
            if (isNaN(lat) || isNaN(lng)) return;

            const marker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background-color:#0056b3; color:white; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; border:2px solid white; font-weight:bold;">${index + 1}</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(map);

            marker.on('click', () => {
                goToStep(index);
            });

            markers.push(marker);
            pathCoords.push([lat, lng]);
        });

        // Draw path between points
        if (pathCoords.length > 1) {
            polyline = L.polyline(pathCoords, {
                color: '#0056b3',
                weight: 3,
                opacity: 0.5,
                dashArray: '5, 10'
            }).addTo(map);
        }

        goToStep(0);
    }

    function goToStep(index) {
        if (index < 0 || index >= storySteps.length) return;

        currentStepIndex = index;
        const step = storySteps[index];

        // Update UI
        stepTitle.textContent = step.title;
        stepCounter.textContent = `Askel ${index + 1} / ${storySteps.length}`;
        stepDescription.textContent = step.description;

        if (step.image_url) {
            stepImage.src = step.image_url;
            stepImage.style.display = 'block';
            imagePlaceholder.style.display = 'none';
        } else {
            stepImage.style.display = 'none';
            imagePlaceholder.style.display = 'block';
        }

        // Update Map
        const lat = parseFloat(step.lat);
        const lng = parseFloat(step.lng);
        map.flyTo([lat, lng], 13);

        // Highlight marker
        markers.forEach((m, i) => {
            if (i === index) {
                m.setZIndexOffset(1000);
                m.getElement().style.transform += ' scale(1.2)';
                m.getElement().style.filter = 'drop-shadow(0 0 5px rgba(0,0,0,0.5))';
            } else {
                m.setZIndexOffset(0);
                if (m.getElement()) {
                    m.getElement().style.filter = 'none';
                }
            }
        });

        // Update Buttons
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index === storySteps.length - 1;
    }

    // Event Listeners
    prevBtn.addEventListener('click', () => goToStep(currentStepIndex - 1));
    nextBtn.addEventListener('click', () => goToStep(currentStepIndex + 1));
});
