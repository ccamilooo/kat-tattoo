const notFound = (req, res, next) => {
    res.status(404).json({ error: 'Ruta no encontrada', path: req.originalUrl });
};

const errorHandler = (err, req, res, next) => {
    console.error('ERROR:', err.message, err.stack || '');
    const status = err.status || 500;
    const message = err.exposeMessage
        ? err.message
        : status === 500
            ? 'Error interno del servidor'
            : err.message;
    res.status(status).json({ error: message });
};

module.exports = { notFound, errorHandler };