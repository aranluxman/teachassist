import assert from "node:assert/strict";
import test from "node:test";
import {
  addEvaluationPhotos,
  deleteEvaluationPhotos,
  evaluationPhotoKey,
  evaluationPhotoOwner,
  listEvaluationPhotos,
  MAX_PHOTO_PAGES,
  removeEvaluationPhoto,
} from "../frontend/js/evaluation-photo-store.js";

test("evaluation photo keys distinguish section, term and duplicate assessment titles", () => {
  const course = { code: "SNC2D1-8", name: "Science 2026-09-08 ~ 2027-02-02" };
  const quiz = { name: "Unit 2", percent: 85 };
  const otherQuiz = { ...quiz };
  const key = evaluationPhotoKey(course, quiz, [quiz, otherQuiz]);
  const refreshed = { name: "  UNIT  2  ", percent: 92, weight: 5 };
  assert.equal(key, evaluationPhotoKey(course, refreshed, [refreshed, otherQuiz]));
  assert.notEqual(key, evaluationPhotoKey(course, otherQuiz, [quiz, otherQuiz]));
  assert.notEqual(key, evaluationPhotoKey({ ...course, code: "SNC2D1-3" }, quiz, [quiz]));
  assert.notEqual(key, evaluationPhotoKey({ ...course, name: "Science 2027-02-03 ~ 2027-06-25" }, quiz, [quiz]));
});

test("temporary photo pages stay within their account and evaluation and preserve original bytes", async () => {
  const owner = evaluationPhotoOwner({ studentNumber: "012345678" });
  const scope = { owner, evaluation: "quiz", temporary: true };
  const demo = { ...scope, owner: evaluationPhotoOwner({ demo: true }) };
  const studentAlso = { ...scope, evaluation: "test" };
  const original = new Blob([new Uint8Array([42, 124, 255])], { type: "image/jpeg" });
  const second = new Blob([new Uint8Array([50])], { type: "image/png" });
  await addEvaluationPhotos(scope, [original, second]);
  await addEvaluationPhotos(demo, [second]);
  await addEvaluationPhotos(studentAlso, [second]);

  const [firstPage, secondPage] = await listEvaluationPhotos(scope);
  assert.equal(firstPage.blob.type, "image/jpeg");
  assert.deepEqual(new Uint8Array(await firstPage.blob.arrayBuffer()), new Uint8Array([42, 124, 255]));
  assert.equal(secondPage.blob, second);
  assert.deepEqual(await listEvaluationPhotos({ ...scope, owner: evaluationPhotoOwner({ studentNumber: "876543210" }) }), []);

  await removeEvaluationPhoto(scope, secondPage);
  await addEvaluationPhotos(scope, [original]);
  await removeEvaluationPhoto(scope, secondPage);
  assert.equal((await listEvaluationPhotos(scope)).length, 2, "deleting an old page cannot remove a replacement");
  await assert.rejects(addEvaluationPhotos(scope, Array(MAX_PHOTO_PAGES).fill(second)), /up to 20 pages/);
  assert.equal((await listEvaluationPhotos(scope)).length, 2, "a rejected batch leaves the collection intact");

  await deleteEvaluationPhotos({ studentNumber: "012345678" });
  assert.deepEqual(await listEvaluationPhotos(scope), []);
  assert.deepEqual(await listEvaluationPhotos(studentAlso), []);
  assert.equal((await listEvaluationPhotos(demo)).length, 1);
});
