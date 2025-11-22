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

// Serve uploads folder statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uri = process.env.MONGO_URI;


// const uri = "mongodb+srv://habit_db_user:UOE2QkQCdu2686yo@cluster0.kzbp8mg.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Multer setup for any image file
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage: storage });

async function run() {
    try {
        // await client.connect();
        const db = client.db('habit-db');
        const dbColl = db.collection('habit-cards');

        // Fetch latest 6 habits

        app.get('/habitCards', async (req, res) => {
            try {
                const result = await dbColl.find().sort({ createdAt: -1 }).limit(6).toArray();
                res.status(200).json(result);
            } catch (err) {
                res.status(500).json({ message: "Failed to fetch habits", error: err.message });
            }
        });
        // Add a new habit
        app.post("/habitCards", upload.single("image"), async (req, res) => {
            try {
                const habit = req.body;
                console.log(habit)
                if (req.file) {
                    habit.imageUrl = `http://localhost:${port}/uploads/${req.file.filename}`;
                }

                habit.createdAt = new Date().toISOString();
                habit.completionHistory = [];
                habit.currentStreak = 0;


                const result = await dbColl.insertOne(habit);
                res.status(201).json({ message: "Habit added successfully", id: result.insertedId });
            } catch (err) {
                res.status(500).json({ message: "Failed to add habit", error: err.message });
            }
        });



        // Add a new habit
        app.post("/habitCards", upload.single("image"), async (req, res) => {
            try {
                const habit = {
                    title: req.body.title,
                    description: req.body.description,
                    creator: {
                        name: req.user?.displayName || req.body.creatorName || "Unknown",
                        email: req.user?.email || req.body.creatorEmail || "Unknown"
                    },
                    createdAt: new Date().toISOString(),
                    completionHistory: [],
                    currentStreak: 0
                };

                if (req.file) {
                    habit.imageUrl = `http://localhost:${port}/uploads/${req.file.filename}`;
                }

                const result = await dbColl.insertOne(habit);
                res.status(201).json({ message: "Habit added successfully", id: result.insertedId });
            } catch (err) {
                res.status(500).json({ message: "Failed to add habit", error: err.message });
            }
        });


        // Update habit
        app.patch("/habits/:id", upload.single("image"), async (req, res) => {
            const { id } = req.params;
            const updatedData = req.body;

            if (req.file) {
                updatedData.imageUrl = `http://localhost:${port}/uploads/${req.file.filename}`;
            }



            try {
                const habit = await dbColl.findOne({ _id: new ObjectId(id) });
                if (!habit) return res.status(404).json({ message: "Habit not found" });

                await dbColl.updateOne({ _id: new ObjectId(id) }, { $set: updatedData });
                const updatedHabit = await dbColl.findOne({ _id: new ObjectId(id) });
                res.status(200).json(updatedHabit);
            } catch (err) {
                res.status(500).json({ message: "Failed to update habit", error: err.message });
            }
        });


        // Get single habit by ID
        app.get("/habits/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const habit = await dbColl.findOne({ _id: new ObjectId(id) });
                if (!habit) {
                    return res.status(404).json({ message: "Habit not found" });
                }
                res.status(200).json(habit);
            } catch (err) {
                res.status(500).json({ message: "Failed to fetch habit", error: err.message });
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
                    const sortedDates = habit.completionHistory.sort(
                        (a, b) => new Date(a) - new Date(b)
                    );


                    habit.currentStreak = calculateStreak(sortedDates);
                    await dbColl.updateOne(
                        { _id: new ObjectId(id) },
                        {
                            $set: {
                                completionHistory: habit.completionHistory,
                                currentStreak: habit.currentStreak,
                            },
                        }
                    );
                }

                res.status(200).json(habit);
            } catch (err) {
                res.status(500).json({ message: "Failed to mark habit complete", error: err.message });
            }
        });


        // Get user's habits
        app.get('/myhabits/:email', async (req, res) => {
            const { email } = req.params;
            try {
                const habits = await dbColl.find({ userEmail: email }).sort({ createdAt: -1 }).toArray();
                res.status(200).json(habits);
            } catch (err) {
                res.status(500).json({ message: "Failed to fetch user's habits", error: err.message });
            }
        });

        // Delete habit
        app.delete("/habits/:id", async (req, res) => {
            const { id } = req.params;

            try {
                const result = await dbColl.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount === 0) return res.status(404).json({ message: "Habit not found" });
                res.status(200).json({ message: "Habit deleted successfully" });
            } catch (err) {
                res.status(500).json({ message: "Failed to delete habit", error: err.message });
            }
        });

        // Get public habits
        app.get('/publicHabits', async (req, res) => {
            try {
                const result = await dbColl.find().sort({ createdAt: -1 }).toArray();
                res.status(200).json(result);

            } catch (err) {
                res.status(500).json({ message: "Failed to fetch public habits", error: err.message });
            }
        });

        console.log("MongoDB connected!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Server is running fine!');
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});



// calculate streak
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



