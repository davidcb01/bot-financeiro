function delay(min = 600, max = 1500) {
  const tempo = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, tempo));
}

module.exports = delay;
