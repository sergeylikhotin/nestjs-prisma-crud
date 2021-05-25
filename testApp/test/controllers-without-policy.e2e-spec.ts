import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { dummySeedFullObj, dummySeedValueString, seed } from '../prisma/seed';
import { AppModule } from '../src/app.module';

describe('CRUD controllers (without policy) e2e', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    beforeEach(async () => {
        try {
            await seed(true);
        } catch (e) {
            console.log(`Error during beforeEach: ${e.message || e}`);
        }
    });

    afterAll(async () => {
        app.close();
    });

    it('POST /users with nested posts, comments and profile', () => {
        const now = Date.now();
        const stringNow = String(now);
        return request(app.getHttpServer())
            .post('/users')
            .send({
                email: stringNow,
                posts: [
                    {
                        title: stringNow,
                        comments: [
                            {
                                title: stringNow,
                            },
                        ],
                    },
                ],
                profile: {
                    fullName: stringNow,
                },
            })
            .expect(201)
            .then((res) => {
                expect(res.body?.posts?.[0]?.comments?.[0]?.title).toEqual(stringNow);
            });
    });

    it('POST /users with empty posts and profile', () => {
        const now = Date.now();
        const stringNow = String(now);
        return request(app.getHttpServer())
            .post('/users')
            .send({
                email: stringNow,
            })
            .expect(201)
            .then((res) => {
                expect(res.body?.posts?.[0]?.comments?.[0]?.title).not.toBeTruthy();
            });
    });

    it('GET /users all without filter', () => {
        return request(app.getHttpServer())
            .get('/users')
            .expect(200)
            .then((res) => {
                expect(res.body?.data?.length).toBeTruthy();
            });
    });

    it('GET /users with shallow filter', () => {
        const crudQ = {
            where: {
                name: dummySeedValueString,
            },
        };
        return request(app.getHttpServer())
            .get('/users')
            .query({
                crudQ: JSON.stringify(crudQ),
            })
            .expect(200)
            .then((res) => {
                expect(res.body?.data?.[0]?.posts?.[0]?.comments?.[0]?.title).toBeTruthy();
            });
    });

    it('GET /users with nested filter', () => {
        const crudQ = {
            where: {
                posts: {
                    some: {
                        title: dummySeedValueString,
                    },
                },
            },
        };
        return request(app.getHttpServer())
            .get('/users')
            .query({
                crudQ: JSON.stringify(crudQ),
            })
            .expect(200)
            .then((res) => {
                expect(res.body?.data?.[0]?.posts?.[0]?.comments?.[0]?.title).toBeTruthy();
            });
    });

    it('GET /users with deep nested filter', () => {
        const crudQ = {
            where: {
                posts: {
                    some: {
                        comments: { some: { title: { contains: dummySeedValueString } } },
                    },
                },
            },
        };
        return request(app.getHttpServer())
            .get('/users')
            .query({
                crudQ: JSON.stringify(crudQ),
            })
            .expect(200)
            .then((res) => {
                expect(res.body?.data?.[0]?.posts?.[0]?.comments?.[0]?.title).toEqual(
                    dummySeedValueString,
                );
            });
    });

    it('GET /users with mixed shallow and deep nested filters', () => {
        const crudQ = {
            where: {
                name: dummySeedValueString,
                posts: {
                    some: {
                        title: dummySeedValueString,
                        comments: {
                            some: { title: { contains: dummySeedValueString[0] } },
                        },
                    },
                },
            },
        };
        return request(app.getHttpServer())
            .get('/users')
            .query({
                crudQ: JSON.stringify(crudQ),
            })
            .expect(200)
            .then((res) => {
                expect(res.body?.data?.[0]?.posts?.[0]?.comments?.[0]?.title).toBeTruthy();
            });
    });

    it('GET /users denies resources when deep nested filter is not in .allowedJoin', () => {
        const crudQ = {
            where: {
                posts: {
                    some: {
                        comments: {
                            some: { post: { author: { id: dummySeedValueString } } },
                        },
                    },
                },
            },
        };
        return request(app.getHttpServer())
            .get('/users')
            .query({
                crudQ: JSON.stringify(crudQ),
            })
            .expect(403)
            .then((res) => {
                expect(res.body?.data?.[0]?.posts?.[0]?.comments?.[0]?.title).not.toBeTruthy();
            });
    });

    it('GET /users pagination is always on', async () => {
        // !NOTE: pagination tests must be adjusted if NUMBER_OF_USER_SEEDS is changed
        await request(app.getHttpServer())
            .get(`/users`)
            .expect(200)
            .then((res) => {
                expect(res.body?.data.length).toEqual(2);
                expect(res.body?.totalRecords).toEqual(2);
                expect(res.body?.page).toEqual(1);
                expect(res.body?.pageSize).toEqual(25);
                expect(res.body?.pageCount).toEqual(1);
                expect(res.body?.orderBy).toEqual([{ id: 'asc' }]);
            });
    });

    it('GET /users pagination .page and .pageSize work', async () => {
        // !NOTE: pagination tests must be adjusted if NUMBER_OF_USER_SEEDS is changed
        let user1;
        await request(app.getHttpServer())
            .get(`/users`)
            .query({ crudQ: JSON.stringify({ page: 1, pageSize: 1 }) })
            .expect(200)
            .then((res) => {
                expect(res.body?.data.length).toEqual(1);
                expect(res.body?.totalRecords).toEqual(2);
                expect(res.body?.page).toEqual(1);
                expect(res.body?.pageSize).toEqual(1);
                expect(res.body?.pageCount).toEqual(2);
                user1 = res.body?.data[0];
            });

        await request(app.getHttpServer())
            .get(`/users`)
            .query({ crudQ: JSON.stringify({ page: 2, pageSize: 1 }) })
            .expect(200)
            .then((res) => {
                expect(res.body?.data.length).toEqual(1);
                expect(res.body?.totalRecords).toEqual(2);
                expect(res.body?.page).toEqual(2);
                expect(res.body?.pageSize).toEqual(1);
                expect(res.body?.pageCount).toEqual(2);
                expect(res.body?.data[0].id).not.toEqual(user1.id);
            });
    });

    it('GET /users pagination works when result set is empty', async () => {
        // !NOTE: pagination tests must be adjusted if NUMBER_OF_USER_SEEDS is changed
        await request(app.getHttpServer())
            .get(`/users`)
            .query({
                crudQ: JSON.stringify({ where: { id: `${Date.now()}` }, pageSize: 1 }),
            })
            .expect(200)
            .then((res) => {
                expect(res.body?.data.length).toEqual(0);
                expect(res.body?.totalRecords).toEqual(0);
                expect(res.body?.page).toEqual(1);
                expect(res.body?.pageSize).toEqual(1);
                expect(res.body?.pageCount).toEqual(0);
            });
    });

    it('GET /users can specify joins from frontend (subset)', async () => {
        await request(app.getHttpServer())
            .get(`/users`)
            .query({
                crudQ: JSON.stringify({ joins: ['posts'] }),
            })
            .expect(200)
            .then((res) => {
                expect(res.body?.data[0]?.posts).toBeTruthy();
                expect(res.body?.data[0]?.posts[0].comments).not.toBeTruthy();
            });
    });

    it('GET /users can specify EMPTY joins from frontend', async () => {
        await request(app.getHttpServer())
            .get(`/users`)
            .query({
                crudQ: JSON.stringify({ joins: [] }),
            })
            .expect(200)
            .then((res) => {
                expect(res.body?.data[0]?.posts).not.toBeTruthy();
            });
    });

    it('GET /users fails if specified joins from frontend are not in allowedJoins', async () => {
        await request(app.getHttpServer())
            .get(`/users`)
            .query({
                crudQ: JSON.stringify({ joins: ['posts.comments.post'] }),
            })
            .expect(403)
            .then((res) => {
                expect(res.body?.data?.[0]?.posts[0].comments.post).not.toBeTruthy();
            });
    });

    it('GET /users/id without filters', () => {
        return request(app.getHttpServer())
            .get(`/users/${dummySeedValueString}`)
            .expect(200)
            .then((res) => {
                expect(res.body?.posts?.[0]?.comments?.[0]?.title).toBeTruthy();
            });
    });

    it('GET /users/id with filters (success)', () => {
        const crudQ = {
            where: {
                name: dummySeedValueString,
                posts: {
                    some: {
                        title: dummySeedValueString,
                        comments: {
                            some: { title: { contains: dummySeedValueString[0] } },
                        },
                    },
                },
            },
        };
        return request(app.getHttpServer())
            .get(`/users/${dummySeedValueString}`)
            .query({
                crudQ: JSON.stringify(crudQ),
            })
            .expect(200)
            .then((res) => {
                expect(res.body?.posts?.[0]?.comments?.[0]?.title).toBeTruthy();
            });
    });

    it('GET /users/id with filters (fail)', () => {
        const crudQ = {
            where: {
                name: dummySeedValueString,
                posts: {
                    some: {
                        title: dummySeedValueString,
                        comments: {
                            some: {
                                title: {
                                    contains:
                                        dummySeedValueString +
                                        'a' /* + 'a' is what makes the object not be found */,
                                },
                            },
                        },
                    },
                },
            },
        };
        return request(app.getHttpServer())
            .get(`/users/${dummySeedValueString}`)
            .query({
                crudQ: JSON.stringify(crudQ),
            })
            .expect(404)
            .then((res) => {
                expect(res.body?.posts?.[0]?.comments?.[0]?.title).not.toBeTruthy();
            });
    });

    it('PATCH /users/id shallow property update', async () => {
        const changedName = `${dummySeedValueString}aaa`;
        const { posts, profile, ...shallowPayload } = dummySeedFullObj;
        shallowPayload.name = changedName;
        await request(app.getHttpServer())
            .patch(`/users/${dummySeedValueString}`)
            .send(shallowPayload)
            .expect(200)
            .then((res) => {
                expect(res.body?.name).toEqual(changedName);
                expect(res.body?.posts?.[0]?.comments?.[0]?.title).toBeTruthy();
            });
    });

    it('PATCH /users/id swap posts from one user to another', async () => {
        let users;
        await request(app.getHttpServer())
            .get(`/users`)
            .expect(200)
            .then((res) => {
                users = res.body.data;
            });

        const [user1, user2] = users.filter((u) => u.posts.length);
        const postsToAddFromUser2 = user2.posts.map((p) => {
            const { author, authorId, ...postWithoutAuthor } = p;
            return postWithoutAuthor;
        });
        // move posts and check response
        await request(app.getHttpServer())
            .patch(`/users/${user1.id}`)
            .send({ ...user1, posts: [...postsToAddFromUser2] })
            .expect(200)
            .then((res) => {
                const { body } = res;
                expect(body?.posts.length).toBe(postsToAddFromUser2.length);
                for (const post of postsToAddFromUser2) {
                    const postIsInResponse = (body?.posts).some(
                        (p) => p.id === post.id && p.comments.length === post.comments.length,
                    );
                    expect(postIsInResponse).toBeTruthy();
                }
            });
        // ensure posts no longer come in response for previous user
        await request(app.getHttpServer())
            .get(`/users/${user2.id}`)
            .expect(200)
            .then((res) => {
                expect(res?.body.posts.length).toBe(0);
            });
    });

    it('PATCH /users/id does not enable updating nested shallow properties', async () => {
        let users;
        await request(app.getHttpServer())
            .get(`/users`)
            .expect(200)
            .then((res) => {
                users = res.body.data;
            });

        const user = users.find((u) => u.posts.length);
        user.posts[0].title = String(Date.now());
        // disassociate posts
        await request(app.getHttpServer())
            .patch(`/users/${user.id}`)
            .send(user)
            .expect(200)
            .then((res) => {
                expect(res?.body?.posts[0].title).not.toBe(user.posts[0].title);
            });
    });

    it('PATCH /users/id remove posts altogether', async () => {
        let users;
        await request(app.getHttpServer())
            .get(`/users`)
            .expect(200)
            .then((res) => {
                users = res.body.data;
            });

        const user = users.find((u) => u.posts.length);
        // disassociate posts
        await request(app.getHttpServer())
            .patch(`/users/${user.id}`)
            .send({ ...user, posts: [] })
            .expect(200)
            .then((res) => {
                expect(res?.body?.posts.length).toBe(0);
            });
    });

    it('PATCH /users/id does NOT disassociate posts when omitted', async () => {
        let users;
        await request(app.getHttpServer())
            .get(`/users`)
            .expect(200)
            .then((res) => {
                users = res.body.data;
            });

        const user = users.find((u) => u.posts.length);
        const originalPostCount = user.posts.length;
        // omit posts
        delete user.posts;
        await request(app.getHttpServer())
            .patch(`/users/${user.id}`)
            .send(user)
            .expect(200)
            .then((res) => {
                expect(res?.body?.posts.length).toBe(originalPostCount);
            });
    });

    it('PATCH /users/id DOES NOT allow associating/disassociating deeper nested properties (comments)', async () => {
        let users;
        await request(app.getHttpServer())
            .get(`/users`)
            .expect(200) // TODO: We likely want to throw exception here
            .then((res) => {
                users = res.body.data;
            });

        const [user1, user2] = users.filter((u) => u.posts[0]?.comments.length);
        const commentCount = user1.posts[0].comments.length;

        user1.posts[0].comments = [...user1.posts[0].comments, ...user2.posts[0].comments];
        // associate new post comments
        await request(app.getHttpServer())
            .patch(`/users/${user1.id}`)
            .send(user1)
            .expect(200) // TODO: We likely want to throw exception here
            .then((res) => {
                expect(res?.body?.posts[0].comments.length).toBe(commentCount);
            });

        user1.posts[0].comments = [];
        // disassociate post comments
        await request(app.getHttpServer())
            .patch(`/users/${user1.id}`)
            .send(user1)
            .expect(200)
            .then((res) => {
                expect(res?.body?.posts[0].comments.length).toBe(commentCount);
            });
    });

    it('PATCH /users/id allows relation to be created by passing only nested .id', async () => {
        let users;
        await request(app.getHttpServer())
            .get(`/users`)
            .expect(200)
            .then((res) => {
                users = res.body.data;
            });

        const [user1, user2] = users.filter((u) => u.posts.length);
        const user2post = user2.posts[0];
        // move post from user2 to user1
        user1.posts = [...user1.posts, { id: user2post.id }];
        await request(app.getHttpServer())
            .patch(`/users/${user1.id}`)
            .send(user1)
            .expect(200)
            .then((res) => {
                const responsePosts = res?.body?.posts;
                const movedPostInResponse = responsePosts.find((v) => v.id === user2post.id) || {};
                expect(responsePosts.length).toBe(user1.posts.length);
                // delete authorId and assert the rest of the object didn't change
                delete movedPostInResponse.authorId;
                delete user2post.authorId;
                expect(movedPostInResponse).toEqual(user2post);
            });
    });

    // create/delete issue
    it('PATCH /users/id allows creating a relation (new object without id) while removing another at the same time', async () => {
        let users;
        await request(app.getHttpServer())
            .get(`/users`)
            .expect(200)
            .then((res) => {
                users = res.body.data;
            });

        const [user] = users.filter((u) => u.posts.length);
        const { id, authorId, ...post } = user.posts[0];
        const reqBody = {
            // set user.posts to only one brand new post
            ...user,
            posts: [{ ...post }],
        };

        await request(app.getHttpServer())
            .patch(`/users/${user.id}`)
            .send(reqBody)
            .expect(200)
            .then((res) => {
                const responsePosts = res?.body?.posts;
                expect(responsePosts.length).toBe(1);
                expect(responsePosts[0].id).not.toBe(id);
            });
    });

    it('DELETE /comments/id works', async () => {
        let commentId: string;
        await request(app.getHttpServer())
            .get(`/users/${dummySeedValueString}`)
            .expect(200)
            .then((res) => {
                commentId = res.body?.posts?.[0]?.comments?.[0]?.id;
                expect(commentId).toBeTruthy();
            });

        await request(app.getHttpServer())
            .get(`/comments/${commentId}`)
            .expect(200)
            .then((res) => {
                expect(res.body?.id).toEqual(commentId);
            });

        await request(app.getHttpServer())
            .delete(`/comments/${commentId}`)
            .expect(200)
            .then((res) => {
                expect(res.body).toEqual({});
            });

        await request(app.getHttpServer()).get(`/comments/${commentId}`).expect(404);
    });
});
