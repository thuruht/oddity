import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';
import { eq, sql, desc, lt } from 'drizzle-orm';

const REPORT_THRESHOLD = 5;

const locations = sqliteTable('locations', {
    id: text('id').primaryKey(), name: text('name').notNull(), description: text('description').notNull(),
    latitude: real('latitude').notNull(), longitude: real('longitude').notNull(),
    imageUrl: text('image_url'), handle: text('handle').notNull(),
    reportCount: integer('report_count').default(0), createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});
const comments = sqliteTable('comments', {
    id: text('id').primaryKey(), locationId: text('location_id').notNull(), handle: text('handle').notNull(),
    comment: text('comment').notNull(), createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

type Env = { Bindings: { DB: D1Database; R2_BUCKET: R2Bucket; ASSETS: Fetcher; R2_PUBLIC_URL: string; } };

const app = new Hono<Env>();
const api = new Hono<Env>();

api.get('/locations', async (c) => {
    try {
        const db = drizzle(c.env.DB);
        const results = await db.select().from(locations).where(lt(locations.reportCount, REPORT_THRESHOLD)).orderBy(desc(locations.createdAt)).limit(200);
        return c.json(results);
    } catch (error) {
        console.error('Locations fetch error:', error);
        return c.json({ error: 'Failed to fetch locations' }, 500);
    }
});

api.get('/locations/:id/comments', async (c) => {
    try {
        const id = c.req.param('id');
        const db = drizzle(c.env.DB);
        const results = await db.select().from(comments).where(eq(comments.locationId, id)).orderBy(desc(comments.createdAt)).limit(50);
        return c.json(results);
    } catch (error) {
        console.error('Comments fetch error:', error);
        return c.json({ error: 'Failed to fetch comments' }, 500);
    }
});

api.post('/locations', async (c) => {
    try {
        const db = drizzle(c.env.DB);
        const formData = await c.req.formData();
        const image = formData.get('image') as File | null;
        const name = formData.get('name') as string;
        const description = formData.get('description') as string;
        const latitude = parseFloat(formData.get('latitude') as string);
        const longitude = parseFloat(formData.get('longitude') as string);
        const handle = `Anonymous#${nanoid(6)}`;

        if (!image || !name || !description || isNaN(latitude) || isNaN(longitude)) {
            return c.json({ error: 'Missing required fields or valid image.' }, 400);
        }

        // Add image validation
        if (image.size > 5 * 1024 * 1024) { // 5MB limit
            return c.json({ error: 'Image too large (max 5MB)' }, 400);
        }
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(image.type)) {
            return c.json({ error: 'Invalid image format' }, 400);
        }

        const imageId = `${nanoid()}.${image.name.split('.').pop()}`;
        await c.env.R2_BUCKET.put(imageId, image);
        const imageUrl = `${c.env.R2_PUBLIC_URL}/${imageId}`;

        const newLocation = { id: nanoid(), name, description, latitude, longitude, handle, imageUrl };
        await db.insert(locations).values(newLocation);
        return c.json(newLocation, 201);
    } catch (error) {
        console.error('Location creation error:', error);
        return c.json({ error: 'Failed to create location' }, 500);
    }
});

api.post('/locations/:id/comments', async (c) => {
    try {
        const id = c.req.param('id');
        const body = await c.req.json();
        if (!body.comment || typeof body.comment !== 'string' || body.comment.length < 1) {
            return c.json({ error: 'Invalid comment.' }, 400);
        }
        const db = drizzle(c.env.DB);
        const handle = `Anonymous#${nanoid(6)}`;
        const newComment = { id: nanoid(), locationId: id, comment: body.comment, handle };
        await db.insert(comments).values(newComment);
        return c.json(newComment, 201);
    } catch (error) {
        console.error('Comment creation error:', error);
        return c.json({ error: 'Failed to create comment' }, 500);
    }
});

api.post('/locations/:id/report', async (c) => {
    try {
        const id = c.req.param('id');
        const db = drizzle(c.env.DB);
        await db.update(locations).set({ reportCount: sql`${locations.reportCount} + 1` }).where(eq(locations.id, id));
        return c.json({ success: true });
    } catch (error) {
        console.error('Report error:', error);
        return c.json({ error: 'Failed to report location' }, 500);
    }
});

app.route('/api', api);
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
