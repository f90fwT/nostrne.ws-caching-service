export function paginate(array, page_size, page_number) {
    return array.slice((page_number - 1) * page_size, page_number * page_size);
}

export function calculateRanking(points, timeSinceSubmission, power) {
    const rank = points / Math.pow(timeSinceSubmission, power);
    return rank;
}