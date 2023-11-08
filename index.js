const express = require('express');
const cors = require("cors");
require("dotenv").config();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());



// Custom Middleware
const logger = (req, res, next) => {
  console.log("Log Info: ",req.method, req.url);
  next();
};

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  console.log("Token in the middleware: ", token);
  if(!token){
      return res.status(401).send({message: "Unathorized"})
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded)=> {
      if(err){
          return res.status(401).send({message: "Unathorized"});
      }

      req.user = decoded;
      next();
  })
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uxpun0e.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // Collections.
    const userCollection = client.db("restaurantDB").collection("user");
    const foodCollection = client.db("restaurantDB").collection("foods");
    const ordersCollection = client.db("restaurantDB").collection("orders");


    // Auth related API
    app.post("/jwt", logger, async(req, res) => {
      const user = req.body;
      console.log("User for token: ", user);

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: "1h"});

      res.cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none"
      })
         .send({success: true});
    });



    /**
     * @ORDER_COLLECTION
     */

    app.post("/orders", async(req, res) => {
      const info = req.body;
      const result = await ordersCollection.insertOne(info);
      res.send(result);
    });


    app.get("/orders", verifyToken, async(req, res) => {
      // console.log(req.query.email);
      // console.log("Cookie: ", req.cookies.token);

      if(req.query?.email !== req.user.email){
        return res.status(403).send({message: "Forbidden Acccess"});
      }

      let query = {};
      if(req.query?.email){
        query = { orderedBy: req.query.email };
      }
      const options = {
        sort: {"dishOrdered": -1}
      };

      const result = await ordersCollection.find(query, options).toArray();
      res.send(result);
    });

    app.delete("/orders/:id", async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await ordersCollection.deleteOne(query);
      res.send(result);
    });


    app.get("/top-selling-items", async(req, res) => {
      const result = await ordersCollection.aggregate([
        {
          $group: {
            _id: "$foodUID",
            totalOrders: {$sum: "$dishOrdered"}
          }
        },
        {
          $sort: {totalOrders: -1}
        },
        {
          $limit: 6
        }
      ]).toArray();

      // console.log("From top-selling route: ", result);
      res.send(result);

    })



    /**
     * @FOODS
     */
    
    app.post("/foods", async(req, res) => {
      const info = req.body;
      // console.log("POST /foods: ", info);
      const result = await foodCollection.insertOne(info);
      res.send(result);
    });

    app.get("/foods", async(req, res) => {
      console.log(req.query.email);
      let query = {};
      if(req.query?.email){
        query = {user_email: req.query.email}
      }
      console.log(query);
      const result = await foodCollection.find(query).toArray();
      res.send(result);
    });

    // Get a single item based on ID
    app.get("/foods/:id", async(req, res) => {
      const id = req.params.id;
      const result = await foodCollection.findOne({_id: new ObjectId(id)});
      res.send(result);
    });


    app.put("/foods/:id", async(req, res) => {
      const info = req.body;

      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const options = {upsert: true};
      const updateDoc = {
        $set: {
          foodName: info.foodName,
          category: info.category, 
          price: info.price, 
          description: info.description, 
          image: info.image, 
          origin: info.origin, 
          qty: info.qty, 
          user_email: info.user_email, 
          user_name: info.user_name
        }
      }

      const result = await foodCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });


    app.patch('/foods/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedInfo = req.body;
      console.log(updatedInfo);
      const updateDoc = {
          $set: {
              qty: updatedInfo.quantity
          },
      };
      const result = await foodCollection.updateOne(filter, updateDoc);
      res.send(result);
  })


    // For Pagination
    app.get("/allfoods", async(req, res) => {
      const result = await foodCollection.find().toArray();
      res.send(result);
    });


    /**
    * @USER_BELOW
    */

    // Saving User info.
    app.post("/user", async(req, res) => {
        const userInfo = req.body;
        // console.log("POST /user :", userInfo);   
        const result = await userCollection.insertOne(userInfo);
        res.send(result);
    });

    // Getting the user info.
    app.get("/user", async(req, res) => {
        const result = await userCollection.find().toArray();
        res.send(result);
    })


    app.post("/logout", async(req, res) => {
      const user = req.body;
      console.log("Loggin out: ", user);
      res.clearCookie("token", {maxAge: 0}).send({success: true});
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get("/", (req, res) =>{
    res.send("Restaurant Management Server is running.");
})


app.listen(port, () => {
    console.log(`Server is running at port: ${port}`);
})