const cron    = require('node-cron');
const { getDB } = require('../config/firebase');

// ============================================================
// GPS Trail Cleanup Job
// প্রতিদিন রাত ২টায় চলবে
// ৩৬৫ দিনের (১ বছর) পুরনো GPS trail Firebase থেকে মুছে দেবে
// ============================================================

const KEEP_DAYS = 365  // ১ বছর

const cleanOldGpsTrails = async () => {
    console.log('\n🗺️  GPS Trail Cleanup শুরু...')

    try {
        const db        = getDB()
        const cutoff    = Date.now() - (KEEP_DAYS * 24 * 60 * 60 * 1000)  // ৩৬৫ দিন আগের timestamp
        const trailsRef = db.ref('gpsTrail')

        // সব user-এর trail আনো
        const snapshot = await trailsRef.once('value')
        const allTrails = snapshot.val()

        if (!allTrails) {
            console.log('✅ GPS Trail ফাঁকা — মোছার কিছু নেই।')
            return
        }

        let totalDeleted = 0

        // প্রতিটি user-এর trail-এ পুরনোগুলো খোঁজো
        const deletePromises = Object.entries(allTrails).map(async ([userId, userTrails]) => {
            if (!userTrails) return

            const oldKeys = Object.keys(userTrails).filter(
                timestamp => parseInt(timestamp) < cutoff
            )

            if (oldKeys.length === 0) return

            // Batch delete
            const updates = {}
            oldKeys.forEach(key => {
                updates[`gpsTrail/${userId}/${key}`] = null
            })

            await db.ref().update(updates)
            totalDeleted += oldKeys.length
            console.log(`   🗑️  ${userId}: ${oldKeys.length}টি পুরনো entry মুছা হয়েছে`)
        })

        await Promise.all(deletePromises)
        console.log(`✅ GPS Trail Cleanup সম্পন্ন — মোট ${totalDeleted}টি entry মুছা হয়েছে।\n`)

    } catch (error) {
        console.error('❌ GPS Trail Cleanup ব্যর্থ:', error.message)
    }
}

const startGpsTrailCleanupJob = () => {
    // প্রতিদিন রাত ২:০০ তে চলবে
    cron.schedule('0 2 * * *', cleanOldGpsTrails, {
        timezone: 'Asia/Dhaka'
    })

    console.log('✅ GPS Trail Cleanup Job চালু — প্রতিদিন রাত ২টায় চলবে (৩৬৫ দিনের পুরনো data মুছবে)')
}

module.exports = { startGpsTrailCleanupJob, cleanOldGpsTrails }
