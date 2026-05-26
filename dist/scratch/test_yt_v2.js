const getYoutubeId = (url) => {
    if (!url) return null;
    // Tuki: shorts, watch?v=, embed, v/, youtu.be
    const regExp = /(?:shorts\/|v=|\/embed\/|\/v\/|youtu.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regExp);
    console.log("URL:", url);
    console.log("Match:", match);
    return (match && match[1]) ? match[1] : null;
};

console.log("ID 1:", getYoutubeId("https://www.youtube.com/shorts/5bLD6f0mZzc?feature=share"));
console.log("ID 2:", getYoutubeId("https://youtube.com/shorts/5bLD6f0mZzc?feature=share"));
console.log("ID 3:", getYoutubeId("https://www.youtube.com/watch?v=5bLD6f0mZzc"));
console.log("ID 4:", getYoutubeId("https://youtu.be/5bLD6f0mZzc"));
