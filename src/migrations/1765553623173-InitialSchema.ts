import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1765553623173 implements MigrationInterface {
    name = 'InitialSchema1765553623173'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if tables already exist (for local dev)
        const usersTable = await queryRunner.hasTable('users');
        
        if (!usersTable) {
            // Production: Create all tables
            await queryRunner.query(`
                CREATE TABLE "users" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "email" character varying NOT NULL,
                    "username" character varying NOT NULL,
                    "password" character varying NOT NULL,
                    "firstName" character varying,
                    "lastName" character varying,
                    "avatarUrl" character varying,
                    "bio" text,
                    "isOnline" boolean NOT NULL DEFAULT false,
                    "lastSeen" TIMESTAMP,
                    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                    "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                    CONSTRAINT "UQ_users_email" UNIQUE ("email"),
                    CONSTRAINT "UQ_users_username" UNIQUE ("username"),
                    CONSTRAINT "PK_users" PRIMARY KEY ("id")
                )
            `);

            await queryRunner.query(`
                CREATE TABLE "friend_requests" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "status" character varying NOT NULL DEFAULT 'pending',
                    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                    "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                    "senderId" uuid,
                    "receiverId" uuid,
                    CONSTRAINT "PK_friend_requests" PRIMARY KEY ("id")
                )
            `);

            await queryRunner.query(`
                CREATE TABLE "friendships" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                    "user1Id" uuid,
                    "user2Id" uuid,
                    CONSTRAINT "PK_friendships" PRIMARY KEY ("id")
                )
            `);

            await queryRunner.query(`
                CREATE TABLE "conversations" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "lastMessageAt" TIMESTAMP,
                    "deletedBy" text,
                    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                    "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                    "participant1Id" uuid,
                    "participant2Id" uuid,
                    CONSTRAINT "PK_conversations" PRIMARY KEY ("id")
                )
            `);

            await queryRunner.query(`
                CREATE TABLE "messages" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "content" text NOT NULL,
                    "isRead" boolean NOT NULL DEFAULT false,
                    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                    "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                    "senderId" uuid,
                    "conversationId" uuid,
                    CONSTRAINT "PK_messages" PRIMARY KEY ("id")
                )
            `);

            // Add foreign keys
            await queryRunner.query(`
                ALTER TABLE "friend_requests" 
                ADD CONSTRAINT "FK_friend_requests_sender" 
                FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE
            `);

            await queryRunner.query(`
                ALTER TABLE "friend_requests" 
                ADD CONSTRAINT "FK_friend_requests_receiver" 
                FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE
            `);

            await queryRunner.query(`
                ALTER TABLE "friendships" 
                ADD CONSTRAINT "FK_friendships_user1" 
                FOREIGN KEY ("user1Id") REFERENCES "users"("id") ON DELETE CASCADE
            `);

            await queryRunner.query(`
                ALTER TABLE "friendships" 
                ADD CONSTRAINT "FK_friendships_user2" 
                FOREIGN KEY ("user2Id") REFERENCES "users"("id") ON DELETE CASCADE
            `);

            await queryRunner.query(`
                ALTER TABLE "conversations" 
                ADD CONSTRAINT "FK_conversations_participant1" 
                FOREIGN KEY ("participant1Id") REFERENCES "users"("id") ON DELETE CASCADE
            `);

            await queryRunner.query(`
                ALTER TABLE "conversations" 
                ADD CONSTRAINT "FK_conversations_participant2" 
                FOREIGN KEY ("participant2Id") REFERENCES "users"("id") ON DELETE CASCADE
            `);

            await queryRunner.query(`
                ALTER TABLE "messages" 
                ADD CONSTRAINT "FK_messages_sender" 
                FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE
            `);

            await queryRunner.query(`
                ALTER TABLE "messages" 
                ADD CONSTRAINT "FK_messages_conversation" 
                FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE
            `);

            // Create indexes
            await queryRunner.query(`
                CREATE INDEX "IDX_messages_conversation" ON "messages" ("conversationId")
            `);

            await queryRunner.query(`
                CREATE INDEX "IDX_messages_sender" ON "messages" ("senderId")
            `);

            await queryRunner.query(`
                CREATE INDEX "IDX_conversations_participant1" ON "conversations" ("participant1Id")
            `);

            await queryRunner.query(`
                CREATE INDEX "IDX_conversations_participant2" ON "conversations" ("participant2Id")
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "messages" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "conversations" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "friendships" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "friend_requests" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
    }
}