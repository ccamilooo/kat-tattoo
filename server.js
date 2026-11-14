require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./src/config/db');

const { notFound, errorHandler } = require('./src/middleware/errorHandler');

const galleryRoutes = require('./src/routes/gallery');
const servicesRoutes = require('./src/routes/services');
const artistsRoutes = require('./src/routes/artists');
const appointmentsRoutes = require('./src/routes/appointments');
const contactRoutes = require('./src/routes/contact');
const aiRoutes = require('./src/routes/ai');
const authRoutes = require('./src/routes/auth');
const referencesRoutes = require('./src/routes/references');
const availabilityRoutes = require('./src/routes/availability');
const recommendationsRoutes = require('./src/routes/recommendations');
const adminRoutes = require('./src/routes/admin');
const artistRoutes = require('./src/routes/artist');
const notificationsRoutes = require('./src/routes/notifications');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// API
app.use('/api/gallery', galleryRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/artists', artistsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/references', referencesRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/artist', artistRoutes);
app.use('/api/notifications', notificationsRoutes);

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT NOW() AS now');
        res.json({ status: 'ok', db: 'connected', time: rows[0].now });
    } catch (err) {
        res.status(503).json({ status: 'error', db: 'disconnected', message: err.message });
    }
});

// Frontend estático (+ uploads de referencias)
app.use(express.static(path.join(__dirname, 'public')));

// 404 y errores
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
    console.log('==============================================');
    console.log(`  KAT TATTOO STUDIO`);
    console.log(`  Sitio web:  http://localhost:${PORT}`);
    console.log(`  Panel:      http://localhost:${PORT}/panel.html`);
    console.log(`  API health: http://localhost:${PORT}/api/health`);
    console.log('==============================================');
});