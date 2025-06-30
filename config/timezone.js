/**
 * Configuración de zona horaria para Chile
 * Chile usa UTC-4 (CLT) en invierno y UTC-3 (CLST) en verano
 */

// Establecer zona horaria de Chile globalmente
process.env.TZ = 'America/Santiago';

/**
 * Obtiene la fecha actual en zona horaria de Chile
 * @returns {Date} Fecha actual en Chile
 */
function getChileDate() {
  return new Date();
}

/**
 * Formatea fecha a ISO string en zona horaria de Chile
 * @param {Date} date - Fecha a formatear (opcional, default: ahora)
 * @returns {string} Fecha en formato ISO en zona horaria de Chile
 */
function toChileISOString(date = new Date()) {
  return date.toLocaleString('sv-SE', { 
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).replace(' ', 'T') + getChileTimezoneOffset();
}

/**
 * Obtiene el offset de Chile respecto a UTC
 * @returns {string} Offset en formato +/-HHMM
 */
function getChileTimezoneOffset() {
  const now = new Date();
  const chileTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
  const utcTime = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  
  const offsetMinutes = (chileTime.getTime() - utcTime.getTime()) / (1000 * 60);
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  
  const sign = offsetMinutes >= 0 ? '+' : '-';
  return `${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;
}

/**
 * Formatea fecha para mostrar en logs (legible)
 * @param {Date} date - Fecha a formatear (opcional, default: ahora)
 * @returns {string} Fecha formateada para Chile
 */
function toChileLogString(date = new Date()) {
  return date.toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Convierte timestamp UTC a fecha de Chile
 * @param {string|Date} utcTimestamp - Timestamp UTC
 * @returns {Date} Fecha convertida a zona horaria de Chile
 */
function utcToChileDate(utcTimestamp) {
  const date = new Date(utcTimestamp);
  return new Date(date.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
}

/**
 * Para uso en queries SQL - obtiene timestamp de Chile
 * @returns {string} Timestamp SQL compatible para Chile
 */
function getSqlChileTimestamp() {
  const now = new Date();
  return now.toLocaleString('sv-SE', { timeZone: 'America/Santiago' }).replace(' ', 'T');
}

module.exports = {
  getChileDate,
  toChileISOString,
  toChileLogString,
  utcToChileDate,
  getSqlChileTimestamp,
  getChileTimezoneOffset
};