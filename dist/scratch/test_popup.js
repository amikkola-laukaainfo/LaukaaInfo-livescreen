const f = {
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [
      26.2050354,
      62.2662039
    ]
  },
  "properties": {
    "title": "portaat",
    "description": "Kuntoportaat on tehty talkootyönä ja hankerahoituksella.",
    "timestamp": 1777049068514,
    "mediaPath": "IMG_20260424_194410_4405454557289246895.jpg",
    "image": "https://ik.imagekit.io/vowzx8znjs/reitix/images/reitti_piste_2_1777105909164.jpg",
    "mediaType": "IMAGE",
    "video": "",
    "info_url": "",
    "audio_url": ""
  }
};

let i = 1;
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const coords = f.geometry.coordinates;
const props = f.properties;
const title = props.title || props.name || `Kohde ${i+1}`;
const description = props.description || props.desc || "";
const IMAGEKIT_BASE = 'https://ik.imagekit.io/vowzx8znjs/reitix/images/';
const hasImage = props.image && props.mediaType === 'IMAGE';
const hasVideo = props.video && props.mediaType === 'VIDEO';

let imageUrl = hasImage ? (props.image.startsWith('http') ? props.image : IMAGEKIT_BASE + props.image) : null;

let popupHtml = `<div style="min-width:180px;"><strong style="font-size:1.05rem;text-transform:capitalize;display:block;margin-bottom:5px;">${escapeHtml(title)}</strong>`;
if (hasImage) {
     let displayUrl = imageUrl;
     if (displayUrl && !displayUrl.includes('?')) displayUrl += '?tr=w-300,h-200,fo-auto';
     
     popupHtml += `<img src="${displayUrl}" 
         onerror="
             if(!this.dataset.tried){ 
                 this.dataset.tried=1; 
                 const fileName = (props.image || '').split('/').pop();
                 this.src = 'reitix/' + fileName;
             } else if(this.dataset.tried==1){ 
                 this.dataset.tried=2; 
                 const fileName = (props.image || '').split('/').pop();
                 this.src = 'reitix/images/' + fileName;
             }
         "
         data-lightbox="${imageUrl}" 
         style="width:100%; border-radius:8px; margin:5px 0; display:block; box-shadow:0 2px 8px rgba(0,0,0,0.1); cursor:zoom-in;" 
         title="Klikkaa suurentaaksesi">`;
}
if (description) {
     const cleanDesc = escapeHtml(description).replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
     popupHtml += `<p style="margin:6px 0 0;font-size:0.85rem;color:#555;line-height:1.4;">${cleanDesc}</p>`;
}

if (props.info_url) {
     popupHtml += `<a href="${props.info_url}" target="_blank" style="display:inline-block; margin-top:8px; font-size:0.8rem; color:#0056b3; text-decoration:none; font-weight:700; border-bottom:1.5px solid #0056b3; padding-bottom:1px;">🔗 Lue lisää &rarr;</a>`;
}

console.log(popupHtml);
