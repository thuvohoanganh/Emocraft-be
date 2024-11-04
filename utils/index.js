const minmaxScaling = (array) => {
    const max = Math.max(...array);
    const min = Math.min(...array);
    if (max-min === 0) return array;
    const result = array.map(e => (e-min)/(max-min))
    return result;
}

module.exports = {
    minmaxScaling
}
