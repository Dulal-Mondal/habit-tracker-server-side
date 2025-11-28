require('dotenv').config();
const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const multer = require("multer");
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

// // Multer setup
// const storage = multer.diskStorage({
//     destination: (req, file, cb) => cb(null, 'uploads/'),
//     filename: (req, file, cb) => {
//         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
//         cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
//     }
// });
// const upload = multer({ storage });

async function run() {
    try {
        const db = client.db('habit-db');
        const dbColl = db.collection('habit-cards');

        // Fetch latest 6 habits
        app.get('/habitCards', async (req, res) => {
            try {
                const result = await dbColl.find().sort({ createdAt: -1 }).limit(6).toArray();
                res.status(200).send(result);
            } catch (err) {
                res.status(500).json({ message: "Failed to fetch habits", error: err.message });
            }
        });
        app.get('/publicHabits', async (req, res) => {
            try {
                const result = await dbColl.find().sort({ createdAt: -1 }).toArray();
                res.status(200).send(result);
            } catch (err) {
                res.status(500).json({ message: "Failed to fetch habits", error: err.message });
            }
        });

        // Add new habit
        app.post("/habitCards", async (req, res) => {
            try {
                const { title, description, category, reminderTime, userEmail, userName, isPrivate, imageUrl } = req.body;

                const habit = {
                    title,
                    description,
                    category,
                    reminderTime,
                    creator: { name: userName || "Unknown", email: userEmail || "Unknown" },
                    isPrivate: isPrivate === "true",
                    createdAt: new Date().toISOString(),
                    completionHistory: [],
                    currentStreak: 0,
                    imageUrl: imageUrl || null
                };

                const result = await dbColl.insertOne(habit);
                res.status(201).json({ message: "Habit added successfully", id: result.insertedId, habit });
            } catch (err) {
                console.error("Failed to add habit:", err);
                res.status(500).json({ message: "Failed to add habit", error: err.message });
            }
        });

        // Get single habit
        app.get("/habits/:id", async (req, res) => {
            const { id } = req.params;
            // ✅
            try {
                const habit = await dbColl.findOne({ _id: new ObjectId(id) });
                if (!habit) return res.status(404).json({ message: "Habit not found" });
                console.log("Habit found:", habit); // ✅
                res.status(200).json(habit);
            } catch (err) {
                console.error("Error fetching habit:", err); // ✅
                res.status(500).json({ message: "Failed to fetch habit", error: err.message });
            }
        });

        // Delete habit
        app.delete("/habits/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const result = await dbColl.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount === 0) return res.status(404).json({ message: "Habit not found" });
                res.status(200).json({ message: "Habit deleted" });
            } catch (err) {
                res.status(500).json({ message: "Failed to delete habit", error: err.message });
            }
        });

        // Update habit
        app.patch("/habits/:id", async (req, res) => {
            const { id } = req.params;
            const { title, description, category, reminderTime } = req.body;

            try {
                const update = { title, description, category, reminderTime };
                const result = await dbColl.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: update }
                );
                if (result.matchedCount === 0) return res.status(404).json({ message: "Habit not found" });

                const updatedHabit = await dbColl.findOne({ _id: new ObjectId(id) });
                res.status(200).json(updatedHabit);
            } catch (err) {
                res.status(500).json({ message: "Failed to update habit", error: err.message });
            }
        });


        // Mark habit complete
        app.patch("/habits/complete/:id", async (req, res) => {
            const { id } = req.params;
            const { date } = req.body;
            try {
                const habit = await dbColl.findOne({ _id: new ObjectId(id) });
                if (!habit) return res.status(404).json({ message: "Habit not found" });

                habit.completionHistory = habit.completionHistory || [];
                if (!habit.completionHistory.includes(date)) {
                    habit.completionHistory.push(date);
                    habit.completionHistory.sort((a, b) => new Date(a) - new Date(b));
                    habit.currentStreak = calculateStreak(habit.completionHistory);
                    await dbColl.updateOne(
                        { _id: new ObjectId(id) },
                        { $set: { completionHistory: habit.completionHistory, currentStreak: habit.currentStreak } }
                    );
                }

                res.status(200).json(habit);
            } catch (err) {
                res.status(500).json({ message: "Failed to mark habit complete", error: err.message });
            }
        });

        // Fetch user's own habits
        app.get('/myHabits/:email', async (req, res) => {
            const { email } = req.params;
            try {
                const habits = await dbColl.find({ "creator.email": email }).sort({ createdAt: -1 }).toArray();
                res.status(200).json(habits);
            } catch (err) {
                console.error("Failed to fetch user's habits:", err);
                res.status(500).json({ message: "Failed to fetch user's habits", error: err.message });
            }
        });

        console.log("MongoDB connected!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Server is running fine!'));
app.listen(port, () => console.log(`Server listening on port ${port}`));

// Calculate streak
function calculateStreak(dates) {
    if (!dates.length) return 0;
    const today = new Date();
    let streak = 0;
    for (let i = dates.length - 1; i >= 0; i--) {
        const d = new Date(dates[i]);
        const diff = Math.floor((today - d) / (1000 * 60 * 60 * 24));
        if (diff === streak) streak++;
        else break;
    }
    return streak;
}
