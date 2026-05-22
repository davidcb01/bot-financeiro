function foraDoHorario() {
  const d = new Date();
  const dia = d.getDay();
  const h = d.getHours();

  if (dia === 0) return true;

  if (dia >= 1 && dia <= 5) {
    return !((h >= 8 && h < 12) || (h >= 14 && h < 18));
  }

  if (dia === 6) {
    return !(h >= 8 && h < 12);
  }

  return true;
}

module.exports = foraDoHorario;
