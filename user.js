const { MongoClient, ObjectId } = require("mongodb");
const express = require('express'); // Express framework
const bodyParser = require('body-parser'); // JSON body parsing middleware
const dotenv = require('dotenv'); // For environment variables
const cors = require('cors'); // For Cross-Origin Resource Sharing
const path = require('path'); // Node.js built-in module for path manipulation
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const authMiddleware = require("./middleware/auth");
const cookieParser = require("cookie-parser");

const isProd = process.env.NODE_ENV === "production";

const cookieOptions = {
    maxAge: 7 * 24 * 60 * 60 * 1000
};



dotenv.config();


const url = process.env.MONGODB_URI;


if (!url) {
    console.error("❌ Error: MONGO_URI environment variable is not set. Please set it in your .env file or Vercel settings.");
    process.exit(1); // 
}

const client = new MongoClient(url);


const dbName = 'Ecommerce';

const app = express();

// Middlewares
app.use(bodyParser.json());
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));

app.use(cookieParser());
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(express.json());
module.exports = app;
async function connectToMongo() {
    try {
        await client.connect();
        console.log("✅ Connected to MongoDB!");
        if (process.env.NODE_ENV !== 'production') { // Check if not in production
            app.listen(3000, () => {
                console.log("🚀 Local Server running on port 3000");
            });
        }

    } catch (e) {
        console.error("❌ Failed to connect to MongoDB:", e);
        process.exit(1);
    }
}
connectToMongo();


// ✅ This route returns the full user object by username
app.get("/api/user/profile", authMiddleware, async (req, res) => {
    const db = client.db(dbName);
    const collection = db.collection("Userdata");

    try {
        const user = await collection.findOne(
            { _id: new ObjectId(req.user.id) },
            { projection: { Password: 0 } }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error("Profile fetch error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});



app.get('/', async (req, res) => {
    const db = client.db(dbName);
    const collection = db.collection('Userdata');
    const findResult = await collection.find({}).toArray();
    console.log('Found documents =>', findResult);
    res.json(findResult)
})
app.post('/', async (req, res) => {
    const userdata = req.body
    const db = client.db(dbName);
    const collection = db.collection('Userdata');
    const findResult = await collection.insertOne(userdata);
    res.send({ success: true, result: findResult })
})

app.post("/add-To-Cart", authMiddleware, async (req, res) => {
    try {
        const db = client.db(dbName);
        const collection = db.collection("Userdata");

        const { productId, name, price, productImg } = req.body;
        const userId = ObjectId.createFromHexString(req.user.id);


        // 1️⃣ Check if product already exists
        const user = await collection.findOne({
            _id: userId,
            "addToCart.productId": productId
        });

        if (user) {
            // 2️⃣ Product exists → increase quantity
            await collection.updateOne(
                { _id: userId, "addToCart.productId": productId },
                { $inc: { "addToCart.$.quantity": 1 } }
            );
        } else {
            // 3️⃣ Product not exists → push new
            await collection.updateOne(
                { _id: userId },
                {
                    $push: {
                        addToCart: {
                            productId,
                            name,
                            price,
                            productImg,
                            quantity: 1
                        }
                    }
                }
            );
        }

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});



app.get("/CartPage", authMiddleware, async (req, res) => {
    const db = client.db(dbName);
    const collection = db.collection("Userdata");
    const userId = ObjectId.createFromHexString(req.user.id);
    const user = await collection.findOne({
        _id: userId,
    });
    // const user = await collection.findOne({ Username: req.params.Username });
    if (user) {
        return res.json(user.addToCart);
    } else {
        return res.status(404).json({ message: "User not found" });
    }
});
app.post("/remove-From-Cart", async (req, res) => {
    const db = client.db(dbName);
    const collection = db.collection("Userdata");
    const { username, productId } = req.body;
    const result = await collection.updateOne(
        { Username: username },
        { $pull: { addToCart: { productId: productId } } }
    );
    if (result.modifiedCount > 0) {
        return res.json({ message: "Item removed from cart", success: true });
    } else {
        return res.json({ message: "Item not found in cart", success: false });
    }
});



app.post("/EmptyCart", async (req, res) => {
    const db = client.db(dbName);
    const collection = db.collection("Userdata");
    const { username } = req.body;
    const result = await collection.updateOne(
        { Username: username },
        { $set: { addToCart: [] } }
    );
    if (result.modifiedCount > 0) {
        return res.json({ message: "Cart Is Empty", success: true });
    } else {
        return res.json({ message: "Error during Emptying the Cart", success: false });
    }
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const db = client.db(dbName);
    const collection = db.collection("Userdata");

    try {
        // 1. Find user by email ONLY
        const user = await collection.findOne({ Email: email });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        // 2. Compare password with bcrypt
        const isPasswordMatch = await bcrypt.compare(password, user.Password);

        if (!isPasswordMatch) {
            alert("Email/Password are incorrect!!!!");
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        // 3. Generate JWT
        const token = jwt.sign(
            { id: user._id, Email: user.Email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );
        // 4. Send safe user object
        const userToSend = {
            _id: user._id.toString(),
            Username: user.Username,
            Name: user.Name,
            Email: user.Email,
            Gender: user.Gender,
            Address: user.Address,
            Phone_Number: user.Phone_Number,
            addToCart: user.addToCart,
            Orders: user.Orders
        };

        res.cookie("token", token);


        return res.status(200).json({
            success: true,
            user: userToSend
        });


    } catch (error) {
        console.error("Error during login:", error);
        alert("Please try again later!!!")
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
});


app.post("/signup", async (req, res) => {
    try {
        const db = client.db(dbName);
        const collection = db.collection("Userdata");

        const {
            Username,
            Name,
            Email,
            Password,
            Gender,
            Address,
            Phone_Number,
            addToCart = [],
            Orders = []
        } = req.body;

        // 1. Check existing user
        const existingUser = await collection.findOne({ Email });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already exists"
            });
        }

        // 2. Hash password
        const hashedPassword = await bcrypt.hash(Password, 10);

        // 3. Create user object
        const Usersdata = {
            Username,
            Name,
            Email,
            Password: hashedPassword,
            Gender,
            Address,
            Phone_Number,
            addToCart,
            Orders,
            createdAt: new Date()
        };

        // 4. Insert user
        const result = await collection.insertOne(Usersdata);

        // after insert
        const userToSend = {
            _id: result.insertedId.toString(),
            Username,
            Name,
            Email,
            Gender,
            Address,
            Phone_Number,
            addToCart,
            Orders
        };
        // 5. Generate JWT
        const token = jwt.sign(
            { id: result.insertedId, Email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.cookie("token", token);

        return res.status(201).json({
            success: true,
            user: userToSend
        });


    } catch (error) {
        console.error("Signup error:", error);
        alert("Please try again later!!!!")
        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});


app.post('/my-profile', authMiddleware, async (req, res) => {
    const db = client.db(dbName);
    const collection = db.collection('Userdata');
    const { Username, Name, Email, Password, id, addToCart } = req.body;
    const Usersdata = { Username, Name, Email, Password, id, addToCart };

    const user = await collection.findOne({ Email: Email });
    if (user) {
        console.log("This email already exist!!!")
        return res.send({ success: false, message: "Email already exists" });
    } else {
        const result = await collection.insertOne(Usersdata);
        console.log("result", result)
        return res.send({ success: true, message: "Signup successful", data: result });
    }
});

// request for data to order
app.post("/Order", authMiddleware, async (req, res) => {
    const db = client.db(dbName);
    const collection = db.collection("Userdata");

    const { OrderId, Address, TotalAmount, ProductData, Phone_number, BaseAmount, CashHandlingCharge, DeliveryCharge, Tax, DeliveredDate, OrderedDate, CancelledDate, OrderStatus } = req.body;

    const order = { OrderId, Address, TotalAmount, ProductData, Phone_number, BaseAmount, CashHandlingCharge, DeliveryCharge, Tax, DeliveredDate, OrderedDate, CancelledDate, OrderStatus };

    const userId = ObjectId.createFromHexString(req.user.id);

    const result = await collection.updateOne(
        { _id: userId },
        { $push: { Orders: order } }
    );
    if (result.modifiedCount > 0) {
        return res.json({ message: "Item added to cart", success: true });
    } else {
        return res.json({ message: "User not found", success: false });
    }
});



app.post("/CancelOrder", async (req, res) => {
    try {
        const db = client.db(dbName);
        const collection = db.collection("Userdata");

        const { username, OrderId, CancelDate } = req.body;

        const result = await collection.updateOne(
            {
                Username: username,
                "Orders.OrderId": OrderId
            },
            {
                $set: {
                    "Orders.$.OrderStatus": "Cancelled",
                    "Orders.$.CancelledDate": CancelDate
                }
            }
        );

        if (result.modifiedCount > 0) {
            return res.json({ message: "Order cancelled successfully", success: true });
        } else {
            return res.json({ message: "Order not found or already cancelled", success: false });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error", success: false });
    }
});


// request for orders from database 
app.get("/Order", authMiddleware, async (req, res) => {
    const db = client.db(dbName);
    const collection = db.collection("Userdata");
    const userId = ObjectId.createFromHexString(req.user.id);
    const user = await collection.findOne({
        _id: userId,
    });
    if (user) {
        return res.json(user.Orders);
    } else {
        return res.status(404).json({ message: "User not found" });
    }
});

// update profile of a user 
app.post("/updateprofile", authMiddleware, async (req, res) => {
    try {
        const db = client.db(dbName);
        const collection = db.collection("Userdata");

        const { Name, Email, Gender, Phone_Number } = req.body;

        if (!Name || !Email || !Phone_Number) {
            return res.json({ success: false, message: "All fields are required" });
        }

        const userId = ObjectId.createFromHexString(req.user.id);

        // 🔒 Check if email is already used by SOME OTHER user
        const emailExists = await collection.findOne({
            Email,
            _id: { $ne: userId }
        });

        if (emailExists) {
            return res.json({ success: false, message: "This email already exists!" });
        }

        const result = await collection.updateOne(
            { _id: userId },
            {
                $set: {
                    Name,
                    Email,
                    Gender,
                    Phone_Number
                }
            }
        );

        if (result.modifiedCount > 0) {
            return res.json({ success: true, message: "Profile updated successfully" });
        }

        return res.json({ success: true, message: "No changes detected" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

app.post("/AddAddress", async (req, res) => {
    const db = client.db(dbName);
    const collection = db.collection('Userdata');
    const { id, Name, Email, Phone_number, PIN_Code, Locality, Address, City, State, Landmark, Alternate_Phone_Number, Address_Type } = req.body;
    const address = { id, Name, Email, Phone_number, PIN_Code, Locality, Address, City, State, Landmark, Alternate_Phone_Number, Address_Type };

    // Update the user profile (including Email, Gender, Name, Phone_Number)

    const result = await collection.updateOne(
        { Email: Email },
        { $push: { Address: address } }
    );
    if (result.modifiedCount > 0) {
        return res.send({ success: true, message: "Address Added Successfully" });
    } else {
        return res.send({ success: false, message: "Error Occured" });
    }
});
// DELETE /api/address/:id
app.delete('/api/address/:id', async (req, res) => {
    const { id } = req.params;
    const db = client.db(dbName);
    const collection = db.collection('Userdata');
    try {
        const result = await collection.updateOne(
            { "Address.id": id },
            { $pull: { Address: { id: id } } }
        );
        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: "Address not found" });
        }
        res.status(200).json({ message: "Address deleted successfully" });
    } catch (err) {
        console.error("Error while deleting address:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Express.js example
app.put('/EditAddress/:id', async (req, res) => {
    const db = client.db(dbName);
    const collection = db.collection('Userdata');
    const { id } = req.params;
    const updatedData = req.body;
    try {
        const result = await collection.updateOne(
            { "Address.id": id },
            { $set: { "Address.$": updatedData } }
        )
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Address not found" });
        }
        res.status(200).json({ message: "Address updated successfully" });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ message: "Error updating address", error });
    }
});
app.post('/checkout', async (req, res) => {
    const db = client.db(dbName);
    const collection = db.collection('Userdata');
    const { username, cart } = req.body;

    try {
        for (const item of cart) {
            const result = await collection.updateOne(
                {
                    Username: username,                       // ✅ your document key
                    "addToCart.productId": item.productId     // ✅ match by number
                },
                {
                    $set: {
                        "addToCart.$.quantity": item.quantity   // ✅ update quantity
                    }
                }
            );

            console.log(`productId: ${item.productId}, quantity: ${item.quantity}`);
            console.log("Matched:", result.matchedCount, "Modified:", result.modifiedCount);
        }

        res.status(200).json({ message: "Cart updated successfully" });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ message: "Error updating address", error });
    }
});

app.post("/logout", authMiddleware, (req, res) => {
    res.clearCookie("token");

    return res.json({ success: true });
});

app.all('*', (req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
});

// ✅ 6. App Listen - Vercel Serverless Functions में यह इग्नोर हो जाएगा
const port = process.env.PORT || 3000;
// IMPORTANT: no app.listen()
module.exports = app;