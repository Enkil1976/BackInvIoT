const pool = require('./config/db');

async function configureContacts() {
    try {
        console.log('📞 Configurando datos de contacto para notificaciones...');

        // Aquí debes configurar tus datos reales
        const contactConfig = {
            // 🔧 CONFIGURA TUS DATOS AQUÍ:
            email: 'tu-email@ejemplo.com',           // Tu email real
            telegram_chat_id: 'TU_CHAT_ID',         // Tu ID de chat de Telegram
            whatsapp_phone: '+56912345678',         // Tu número de WhatsApp (formato internacional)
            
            // Para obtener tu Telegram Chat ID:
            // 1. Busca @userinfobot en Telegram
            // 2. Envía /start
            // 3. Te dará tu Chat ID (ej: 123456789)
        };

        // Crear objeto de preferencias
        const preferences = {
            email: contactConfig.email,
            telegram_chat_id: contactConfig.telegram_chat_id,
            whatsapp_phone: contactConfig.whatsapp_phone,
            enabled_channels: ['email', 'telegram', 'whatsapp'],
            notification_hours: {
                start: '08:00',
                end: '22:00'
            },
            severity_filter: ['high', 'medium', 'low']
        };

        // Actualizar la configuración de usuarios con los datos de contacto
        const updateUserQuery = `
            UPDATE users 
            SET notification_preferences = $1
            WHERE username = 'admin'
            RETURNING username, notification_preferences;
        `;

        const userResult = await pool.query(updateUserQuery, [JSON.stringify(preferences)]);

        if (userResult.rows.length > 0) {
            console.log('✅ Configuración de contacto actualizada para el usuario admin');
            console.log('📧 Email:', contactConfig.email);
            console.log('💬 Telegram Chat ID:', contactConfig.telegram_chat_id);
            console.log('📱 WhatsApp:', contactConfig.whatsapp_phone);
        } else {
            console.log('⚠️  Usuario admin no encontrado, creando configuración default...');
        }

        // Verificar configuración actual
        const checkQuery = 'SELECT username, notification_preferences FROM users WHERE username = $1';
        const checkResult = await pool.query(checkQuery, ['admin']);
        
        if (checkResult.rows.length > 0) {
            console.log('\n📋 Configuración actual:');
            console.log(JSON.stringify(checkResult.rows[0].notification_preferences, null, 2));
        }

        // Mostrar las reglas configuradas
        const rulesQuery = 'SELECT id, name, description, is_enabled, priority FROM rules ORDER BY priority ASC';
        const rulesResult = await pool.query(rulesQuery);
        
        console.log('\n🔔 Reglas de notificación activas:');
        rulesResult.rows.forEach(rule => {
            console.log(`- [ID:${rule.id}] ${rule.name}: ${rule.description} (Prioridad: ${rule.priority}) ${rule.is_enabled ? '✅' : '❌'}`);
        });

        console.log('\n🚀 Sistema de notificaciones listo!');
        console.log('\n📝 Próximos pasos:');
        console.log('1. ✏️  Edita este archivo y pon tus datos reales de contacto');
        console.log('2. 🔄 Vuelve a ejecutar: node configure_contacts.js');
        console.log('3. 🧪 Prueba el sistema: node test_notifications.js');
        console.log('4. 🌡️  Simula datos: npm run simulate:mqtt');
        console.log('\n💡 Las notificaciones se enviarán cuando los sensores reporten valores fuera de los rangos configurados.');

    } catch (error) {
        console.error('❌ Error configurando contactos:', error);
    } finally {
        process.exit(0);
    }
}

configureContacts();