import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import Elysia from "elysia";
import path from 'path';
import type { Env } from "../db/db";
import * as schema from "../db/schema";
import { feeds, hashtags } from "../db/schema";
import { getEnv } from "../utils/di";
import { createS3Client } from "../utils/s3";

export function SitemapService() {
    const env: Env = getEnv();
    const endpoint = env.S3_ENDPOINT;
    const accessHost = env.S3_ACCESS_HOST || endpoint;
    const folder = env.S3_CACHE_FOLDER || 'cache/';
    return new Elysia({ aot: false })
        .get('/seo/sitemap.xml', async ({ set }) => {
            const host = `${(accessHost.startsWith("http://") || accessHost.startsWith("https://") ? '' :'https://')}${accessHost}`;
            if (!host) {
                set.status = 500;
                return 'S3_ACCESS_HOST is not defined'
            }
            const key = `${folder}sitemap.xml`;
            try {
                const url = `${host}/${key}`;
                console.log(`Fetching ${url}`);
                const response = await fetch(new Request(url))
                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: {
                        'Content-Type': 'application/xml; charset=UTF-8',
                        'Cache-Control': response.headers.get('Cache-Control') || 'public, max-age=3600',
                    }
                });
            } catch (e: any) {
                console.error(e);
                set.status = 500;
                return e.message;
            }
        })
}

export async function sitemapCrontab(env: Env) {
    const frontendUrl = `${env.FRONTEND_URL.startsWith("http://") || env.FRONTEND_URL.startsWith("https://") ? "" : "https://"}${env.FRONTEND_URL}`;
    const db = drizzle(env.DB, { schema: schema });

    const now = new Date();

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    function addUrl(loc: string, lastmod?: Date, changefreq: string = 'weekly', priority: number = 0.5) {
        xml += '  <url>\n';
        xml += `    <loc>${loc}</loc>\n`;
        if (lastmod) {
            xml += `    <lastmod>${lastmod.toISOString()}</lastmod>\n`;
        }
        xml += `    <changefreq>${changefreq}</changefreq>\n`;
        xml += `    <priority>${priority}</priority>\n`;
        xml += '  </url>\n';
    }

    addUrl(frontendUrl, now, 'daily', 1.0);
    addUrl(`${frontendUrl}/feeds`, now, 'daily', 0.9);
    addUrl(`${frontendUrl}/timeline`, now, 'daily', 0.8);
    addUrl(`${frontendUrl}/moments`, now, 'daily', 0.7);
    addUrl(`${frontendUrl}/hashtags`, now, 'weekly', 0.6);

    const feed_list = await db.query.feeds.findMany({
        where: and(eq(feeds.draft, 0), eq(feeds.listed, 1)),
        columns: {
            id: true,
            alias: true,
            updatedAt: true,
        },
        orderBy: [desc(feeds.updatedAt)],
    });

    for (const feed of feed_list) {
        const url = feed.alias ? `${frontendUrl}/feed/${feed.alias}` : `${frontendUrl}/feed/${feed.id}`;
        addUrl(url, feed.updatedAt, 'weekly', 0.8);
    }

    const hashtag_list = await db.query.hashtags.findMany({
        columns: {
            id: true,
            name: true,
            updatedAt: true,
        },
        orderBy: [desc(hashtags.updatedAt)],
    });

    for (const tag of hashtag_list) {
        addUrl(`${frontendUrl}/hashtag/${tag.id}`, tag.updatedAt, 'weekly', 0.5);
    }

    xml += '</urlset>';

    console.log("save sitemap.xml to s3");
    const bucket = env.S3_BUCKET;
    const folder = env.S3_CACHE_FOLDER || "cache/";
    const s3 = createS3Client();
    const hashkey = `${folder}sitemap.xml`;
    try {
        await s3.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: hashkey,
                Body: xml,
                ContentType: 'application/xml',
            }),
        );
        console.log("Saved sitemap.xml to s3");
    } catch (e: any) {
        console.error(e.message);
    }
}
