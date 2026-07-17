import logging
from motor.motor_asyncio import AsyncIOMotorClient
try:
    from .config import MONGODB_URL, DATABASE_NAME
except ImportError:
    from config import MONGODB_URL, DATABASE_NAME

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None
    db = None

db_instance = Database()

async def connect_to_mongo():
    logger.info("Connecting to MongoDB...")
    db_instance.client = AsyncIOMotorClient(MONGODB_URL)
    db_instance.db = db_instance.client[DATABASE_NAME]
    
    # Ping database to verify connection
    try:
        await db_instance.client.admin.command('ping')
        logger.info("Successfully connected to MongoDB!")
        
        # Create indexes for optimal performance
        await db_instance.db.sessions.create_index("createdAt")
        await db_instance.db.screenshots.create_index("sessionId")
        await db_instance.db.screenshots.create_index([("sessionId", 1), ("timestamp", 1)])
        logger.info("Indexes created successfully.")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        raise e

async def close_mongo_connection():
    logger.info("Closing MongoDB connection...")
    if db_instance.client:
        db_instance.client.close()
        logger.info("MongoDB connection closed.")

def get_database():
    return db_instance.db
