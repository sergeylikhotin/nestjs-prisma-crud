import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { dummySeedFullObj, dummySeedValueString, NUMBER_OF_USER_SEEDS, seed } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('CRUD controllers (without policy) e2e', () => {
    let app: INestApplication;
    let prismaService: PrismaService;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
        prismaService = app.get(PrismaService);
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

    describe('POST /users', () => {
        let countries;

        beforeEach(async () => {
            const prismaService = app.get(PrismaService);
            countries = await prismaService.country.findMany();
        });

        it('creates nested posts, comments and profile', () => {
            const now = Date.now();
            const stringNow = String(now);
            return request(app.getHttpServer())
                .post('/users')
                .send({
                    email: stringNow,
                    password: 'this value should not come in response',
                    posts: [
                        {
                            title: stringNow,
                            comments: [
                                {
                                    title: stringNow,
                                    exampleForbiddenProperty:
                                        'this value should not come in response',
                                },
                            ],
                        },
                    ],
                    profile: {
                        fullName: stringNow,
                    },
                    country: countries[0],
                })
                .expect(201)
                .then((res) => {
                    expect(res.body?.posts?.[0]?.comments?.[0]?.title).toEqual(stringNow);
                });
        });

        it('does not create relations that are outside allowedJoins', async () => {
            const prismaService = app.get(PrismaService);
            const now = Date.now();
            const stringNow = String(now);
            const categoryCountBefore = await prismaService.category.count();
            await request(app.getHttpServer())
                .post('/users')
                .send({
                    email: stringNow,
                    password: 'this value should not come in response',
                    posts: [
                        {
                            title: stringNow,
                            comments: [
                                {
                                    title: stringNow,
                                },
                            ],
                            categories: [
                                {
                                    title: stringNow,
                                    exampleForbiddenProperty:
                                        'this value should not come in response',
                                },
                            ],
                        },
                    ],
                    profile: {
                        fullName: stringNow,
                    },
                    country: countries[0],
                })
                .expect(403);

            const categoryCountAfter = await prismaService.category.count();
            expect(categoryCountBefore).toBe(categoryCountAfter);
        });

        it('does not fail when optional relations are absent ', () => {
            const now = Date.now();
            const stringNow = String(now);
            return request(app.getHttpServer())
                .post('/users')
                .send({
                    email: stringNow,
                    password: 'this value should not come in response',
                    country: countries[0],
                })
                .expect(201)
                .then((res) => {
                    expect(res.body?.posts?.[0]?.comments?.[0]?.title).not.toBeTruthy();
                });
        });
    });

    describe('GET many /users', () => {
        describe('filters', () => {
            it('works without filters', () => {
                return request(app.getHttpServer())
                    .get('/users')
                    .expect(200)
                    .then((res) => {
                        expect(res.body?.data?.length).toBeTruthy();
                    });
            });

            it('works with shallow filter', () => {
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

            it('works with nested filter', () => {
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

            it('works with deep nested filter', () => {
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

            it('works with mixed shallow and deep nested filters', () => {
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

            it('denies resources when deep nested filter is not in .allowedJoin', () => {
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
                        expect(
                            res.body?.data?.[0]?.posts?.[0]?.comments?.[0]?.title,
                        ).not.toBeTruthy();
                    });
            });

            it(`correctly handles 'in' special case`, () => {
                const crudQ = {
                    where: {
                        posts: {
                            some: {
                                comments: {
                                    some: {
                                        title: { in: [dummySeedValueString, 'some other string'] },
                                    },
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
                        expect(res.body?.data?.[0]?.posts?.[0]?.comments?.[0]?.title).toEqual(
                            dummySeedValueString,
                        );
                    });
            });

            it(`correctly handles 'notIn' special case`, () => {
                const crudQ = {
                    where: {
                        posts: {
                            some: {
                                comments: {
                                    some: {
                                        title: {
                                            notIn: [dummySeedValueString, 'some other string'],
                                        },
                                    },
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
                        expect(res.body?.data?.length).toBe(NUMBER_OF_USER_SEEDS - 1);
                    });
            });
        });

        describe('pagination', () => {
            it('pagination is always on', async () => {
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

            it('pagination .page and .pageSize work', async () => {
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

            it('pagination works when result set is empty', async () => {
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
        });

        describe('client specified joins', () => {
            it('joins can be specified from frontend', async () => {
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

            it('client can specify EMPTY joins from frontend', async () => {
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

            it('route fails if client specified joins are not in allowedJoins', async () => {
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
        });
    });

    describe('GET one /users/id', () => {
        it('works without filters', () => {
            return request(app.getHttpServer())
                .get(`/users/${dummySeedValueString}`)
                .expect(200)
                .then((res) => {
                    expect(res.body?.posts?.[0]?.comments?.[0]?.title).toBeTruthy();
                });
        });

        it('works with filters (success)', () => {
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

        it('works with filters (fail)', () => {
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
    });

    describe('PATCH /users/id', () => {
        it('shallow property update works', async () => {
            const changedName = `${dummySeedValueString}aaa`;
            const { posts, profile, country, ...shallowPayload } = dummySeedFullObj;
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

        it('swapping related records (posts) from one user to another works', async () => {
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
            const payload = { ...user1, posts: [...postsToAddFromUser2] };
            // move posts and check response
            await request(app.getHttpServer())
                .patch(`/users/${user1.id}`)
                .send(payload)
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

        it("updating related record's properties is not allowed", async () => {
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

        it("updating related record's properties is not allowed (set to null)", async () => {
            let users;
            await request(app.getHttpServer())
                .get(`/users`)
                .expect(200)
                .then((res) => {
                    users = res.body.data;
                });

            const user = users.find((u) => u.posts.length);
            const { someNullableValue } = user.country;
            user.country.someNullableValue = null;
            await request(app.getHttpServer())
                .patch(`/users/${user.id}`)
                .send(user)
                .expect(200)
                .then((res) => {
                    expect(res?.body?.country?.someNullableValue).toBe(someNullableValue);
                });
        });

        it('removing related records (posts) altogether works', async () => {
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

        it('related records do NOT disassociate when omitted', async () => {
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

        it('route DOES NOT allow associating/disassociating deeper nested relations (comments)', async () => {
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

        it('relation can be created by passing only nested .id', async () => {
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
                    const movedPostInResponse =
                        responsePosts.find((v) => v.id === user2post.id) || {};
                    expect(responsePosts.length).toBe(user1.posts.length);
                    // delete authorId and assert the rest of the object didn't change
                    delete movedPostInResponse.authorId;
                    delete user2post.authorId;
                    expect(movedPostInResponse).toEqual(user2post);
                });
        });

        it('relation can be replaced by passing only nested .id for n:1 relations', async () => {
            let users;
            await request(app.getHttpServer())
                .get(`/users`)
                .expect(200)
                .then((res) => {
                    users = res.body.data;
                });

            const user1 = users[0];
            const user2 = users.find((u) => u.country.id !== user1.country.id);
            const user2country = user2.country;
            await request(app.getHttpServer())
                .patch(`/users/${user1.id}`)
                .send({ ...user1, country: { id: user2country.id } })
                .expect(200)
                .then((res) => {
                    expect(res?.body?.country.id).not.toBe(user1);
                    expect(res?.body?.country.id).toBe(user2country.id);
                });
        });

        it('creating and deleting different relations at once works (new object without id + omitted adjacent object)', async () => {
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

        it('relation can be removed by passing null object', async () => {
            let user;
            await request(app.getHttpServer())
                .get(`/users`)
                .expect(200)
                .then((res) => {
                    user = res.body.data[0];
                });

            // remove country
            await request(app.getHttpServer())
                .patch(`/users/${user.id}`)
                .send({ ...user, country: null })
                .expect(200)
                .then((res) => {
                    expect(res?.body?.country).toBe(null);
                });

            // second update (empty) confirms if subsequent saves will also work
            await request(app.getHttpServer())
                .patch(`/users/${user.id}`)
                .send({ ...user, country: null })
                .expect(200)
                .then((res) => {
                    expect(res?.body?.country).toBe(null);
                });
        });

        it('nullable shallow value can be set to null', async () => {
            let user;
            await request(app.getHttpServer())
                .get(`/users`)
                .expect(200)
                .then((res) => {
                    user = res.body.data[0];
                });

            await request(app.getHttpServer())
                .patch(`/users/${user.id}`)
                .send({ ...user, name: null })
                .expect(200)
                .then((res) => {
                    expect(res?.body?.name).toBe(null);
                });
        });
    });

    describe('DELETE /users/id', () => {
        it('deleting single record works', async () => {
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

    describe('Forbidden properties', () => {
        it('GET many excludes forbiddenPaths', () => {
            return request(app.getHttpServer())
                .get('/users')
                .expect(200)
                .then((res) => {
                    expect(res.body.data.length).toBeTruthy();
                    for (let i = 0; i < res.body.data.length; i++) {
                        const record = res.body.data[i];
                        expect(record.password).toBeFalsy();
                        expect(
                            record.posts?.[0]?.comments?.[0]?.exampleForbiddenProperty,
                        ).toBeFalsy();
                    }
                });
        });

        it('GET one excludes forbiddenPaths', () => {
            return request(app.getHttpServer())
                .get(`/users/${dummySeedValueString}`)
                .expect(200)
                .then((res) => {
                    expect(res.body?.password).toBeFalsy();
                    expect(
                        res.body?.posts?.[0]?.comments?.[0]?.exampleForbiddenProperty,
                    ).toBeFalsy();
                });
        });

        it('PATCH excludes forbiddenPaths', async () => {
            const changedName = `${dummySeedValueString}aaa`;
            const { posts, profile, country, ...shallowPayload } = dummySeedFullObj;
            shallowPayload.name = changedName;
            await request(app.getHttpServer())
                .patch(`/users/${dummySeedValueString}`)
                .send(shallowPayload)
                .expect(200)
                .then((res) => {
                    expect(res.body?.password).toBeFalsy();
                    expect(
                        res.body?.posts?.[0]?.comments?.[0]?.exampleForbiddenProperty,
                    ).toBeFalsy();
                });
        });

        it('POST excludes forbiddenPaths ', async () => {
            const country = await prismaService.country.findFirst();
            const now = Date.now();
            const stringNow = String(now);
            return request(app.getHttpServer())
                .post('/users')
                .send({
                    email: stringNow,
                    password: 'this value should not come in response',
                    posts: [
                        {
                            title: stringNow,
                            comments: [
                                {
                                    title: stringNow,
                                    exampleForbiddenProperty:
                                        'this value should not come in response',
                                },
                            ],
                        },
                    ],
                    profile: {
                        fullName: stringNow,
                    },
                    country,
                })
                .expect(201)
                .then((res) => {
                    expect(res.body?.password).toBeFalsy();
                    expect(
                        res.body?.posts?.[0]?.comments?.[0]?.exampleForbiddenProperty,
                    ).toBeFalsy();
                });
        });
    });
});
