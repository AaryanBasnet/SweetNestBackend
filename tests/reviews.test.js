const request = require("supertest");

const app = require("../app");
const Review = require("../model/Review");
const {
  createUser,
  createAdmin,
  createCake,
  createReview,
  auth,
  objectId,
} = require("./helpers/factories");

describe("POST /api/reviews/:id/helpful", () => {
  // This endpoint used to be unauthenticated and simply did helpfulCount += 1,
  // so anyone could script review rankings to whatever they wanted.
  it("requires authentication", async () => {
    const cake = await createCake();
    const author = await createUser();
    const review = await createReview(author.user._id, cake._id);

    const res = await request(app).post(`/api/reviews/${review._id}/helpful`);

    expect(res.status).toBe(401);
    expect((await Review.findById(review._id)).helpfulCount).toBe(0);
  });

  it("records one vote from a logged-in user", async () => {
    const cake = await createCake();
    const author = await createUser();
    const voter = await createUser();
    const review = await createReview(author.user._id, cake._id);

    const res = await request(app)
      .post(`/api/reviews/${review._id}/helpful`)
      .set(auth(voter.token));

    expect(res.status).toBe(200);
    expect(res.body.data.helpfulCount).toBe(1);
    expect(res.body.data.hasVoted).toBe(true);
  });

  it("cannot be inflated by one user voting repeatedly", async () => {
    const cake = await createCake();
    const author = await createUser();
    const voter = await createUser();
    const review = await createReview(author.user._id, cake._id);

    // Vote, un-vote, vote, un-vote, vote - an odd number of presses.
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post(`/api/reviews/${review._id}/helpful`)
        .set(auth(voter.token));
    }

    expect((await Review.findById(review._id)).helpfulCount).toBe(1);
  });

  it("toggles the vote off when pressed twice", async () => {
    const cake = await createCake();
    const author = await createUser();
    const voter = await createUser();
    const review = await createReview(author.user._id, cake._id);

    await request(app)
      .post(`/api/reviews/${review._id}/helpful`)
      .set(auth(voter.token));
    const second = await request(app)
      .post(`/api/reviews/${review._id}/helpful`)
      .set(auth(voter.token));

    expect(second.body.data.helpfulCount).toBe(0);
    expect(second.body.data.hasVoted).toBe(false);
  });

  it("counts distinct users separately", async () => {
    const cake = await createCake();
    const author = await createUser();
    const review = await createReview(author.user._id, cake._id);

    for (let i = 0; i < 3; i += 1) {
      const voter = await createUser();
      await request(app)
        .post(`/api/reviews/${review._id}/helpful`)
        .set(auth(voter.token));
    }

    expect((await Review.findById(review._id)).helpfulCount).toBe(3);
  });

  it("keeps helpfulCount in step with the recorded voters", async () => {
    const cake = await createCake();
    const author = await createUser();
    const voter = await createUser();
    const review = await createReview(author.user._id, cake._id);

    await request(app)
      .post(`/api/reviews/${review._id}/helpful`)
      .set(auth(voter.token));

    const stored = await Review.findById(review._id);
    expect(stored.helpfulCount).toBe(stored.helpfulVotes.length);
    expect(stored.helpfulVotes[0].toString()).toBe(voter.user._id.toString());
  });

  it("404s for a review that does not exist", async () => {
    const voter = await createUser();

    const res = await request(app)
      .post(`/api/reviews/${objectId()}/helpful`)
      .set(auth(voter.token));

    expect(res.status).toBe(404);
  });
});

describe("POST /api/cakes/:cakeId/reviews", () => {
  it("requires authentication", async () => {
    const cake = await createCake();

    const res = await request(app)
      .post(`/api/cakes/${cake._id}/reviews`)
      .send({ rating: 5, comment: "Lovely cake, would buy again." });

    expect(res.status).toBe(401);
  });

  it("lets a logged-in user leave one review", async () => {
    const cake = await createCake();
    const { token } = await createUser();

    const res = await request(app)
      .post(`/api/cakes/${cake._id}/reviews`)
      .set(auth(token))
      .send({ rating: 5, comment: "Lovely cake, would buy again." });

    expect([200, 201]).toContain(res.status);
  });

  it("refuses a second review of the same cake by the same user", async () => {
    const cake = await createCake();
    const { token } = await createUser();
    const body = { rating: 4, comment: "Good, but the first one was better." };

    await request(app)
      .post(`/api/cakes/${cake._id}/reviews`)
      .set(auth(token))
      .send(body);
    const second = await request(app)
      .post(`/api/cakes/${cake._id}/reviews`)
      .set(auth(token))
      .send(body);

    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(await Review.countDocuments({ cake: cake._id })).toBe(1);
  });

  it("rejects an out-of-range rating", async () => {
    const cake = await createCake();
    const { token } = await createUser();

    const res = await request(app)
      .post(`/api/cakes/${cake._id}/reviews`)
      .set(auth(token))
      .send({ rating: 99, comment: "Off the charts, literally." });

    expect(res.status).toBe(400);
  });
});

describe("review moderation", () => {
  it("refuses a normal user access to the moderation queue", async () => {
    const { token } = await createUser();

    const res = await request(app).get("/api/reviews/admin/all").set(auth(token));

    expect(res.status).toBe(403);
  });

  it("lets an admin see the moderation queue", async () => {
    const { token } = await createAdmin();

    const res = await request(app).get("/api/reviews/admin/all").set(auth(token));

    expect(res.status).toBe(200);
  });

  it("refuses a normal user the ability to approve a review", async () => {
    const cake = await createCake();
    const author = await createUser();
    const attacker = await createUser();
    const review = await createReview(author.user._id, cake._id, {
      isApproved: false,
    });

    const res = await request(app)
      .put(`/api/reviews/admin/${review._id}/approve`)
      .set(auth(attacker.token))
      .send({ isApproved: true });

    expect(res.status).toBe(403);
    expect((await Review.findById(review._id)).isApproved).toBe(false);
  });
});
