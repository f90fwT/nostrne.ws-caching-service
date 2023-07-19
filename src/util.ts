export function paginate(array, page_size, page_number) {
    return array.slice((page_number - 1) * page_size, page_number * page_size);
}

export function calculateRanking(points, timeSinceSubmission, power) {
    const rank = points / Math.pow(timeSinceSubmission, power);
    return rank;
}

export function formatPostContent(content) {
    try {
        const lines = content.split('\n');
        const titleLine = lines[1];
        const urlLine = lines[2];
        const textLines = lines.slice(3);
      
        const titleMatch = titleLine.match(/title:\s*(.*)/);
        const urlMatch = urlLine.match(/url:\s*(.*)/);
      
        const title = titleMatch ? titleMatch[1] : '';
        const url = urlMatch ? urlMatch[1] : '';
        let text = textLines.join('\n');

        if (text.startsWith("text: ")) text = text.substring(6);
      
        return {
          title: title || content,
          url: url || undefined,
          text: text || undefined,
        };
    } catch (err) {
        return { title: content, url: undefined, text: undefined };
    }
}
