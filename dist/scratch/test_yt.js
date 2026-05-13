const getYoutubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
    const match = url.match(regExp);
    console.log("URL:", url);
    console.log("Match:", match);
    return (match && match[2].length === 11) ? match[2] : null;
};

console.log("ID:", getYoutubeId("https://www.youtube.com/shorts/5bLD6f0mZzc?feature=share"));
console.log("ID:", getYoutubeId("https://youtube.com/shorts/5bLD6f0mZzc?feature=share"));
