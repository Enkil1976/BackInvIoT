// Calcula el punto de rocío a partir de temperatura y humedad
function calcDewPoint(temp, hum) {
  if (temp == null || hum == null) return null;

  const a = 17.27;
  const b = 237.7;
  const alpha = (a * temp) / (b + temp) + Math.log(hum / 100);
  return Number((b * alpha / (a - alpha)).toFixed(2));
}

module.exports = calcDewPoint;
