import assert from "node:assert/strict";
import test from "node:test";

import {
  REFERENCE_CHARACTER_ROLE_OPTIONS,
  buildReferenceCharacterImagePrompt,
  buildReferenceCharacterStoryPrompt,
  parseReferenceCharactersFormValue,
} from "./reference-characters";

test("reference character role options cover general relationship labels", () => {
  const labels = REFERENCE_CHARACTER_ROLE_OPTIONS.map((option) => option.label);

  assert.deepEqual(labels, ["爸爸", "妈妈", "孩子", "男主", "女主", "朋友", "家人", "宠物", "自定义"]);
});

test("parseReferenceCharactersFormValue normalizes lightweight role cards", () => {
  const result = parseReferenceCharactersFormValue(
    JSON.stringify({
      primaryReference: "2",
      relationshipNote: "爸爸陪小宇第一次坐火车",
      characters: [
        { referenceIndex: 1, roleLabel: "爸爸", nickname: "爸爸" },
        { referenceIndex: 2, roleLabel: "孩子", nickname: "小宇" },
      ],
    }),
    2,
  );

  assert.deepEqual(result, {
    relationshipNote: "爸爸陪小宇第一次坐火车",
    characters: [
      {
        isPrimary: false,
        nickname: "爸爸",
        referenceIndex: 1,
        relationshipNote: "爸爸陪小宇第一次坐火车",
        roleLabel: "爸爸",
      },
      {
        isPrimary: true,
        nickname: "小宇",
        referenceIndex: 2,
        relationshipNote: "爸爸陪小宇第一次坐火车",
        roleLabel: "孩子",
      },
    ],
  });
});

test("parseReferenceCharactersFormValue falls back to low-friction defaults", () => {
  const result = parseReferenceCharactersFormValue(null, 2);

  assert.deepEqual(result.characters, [
    {
      isPrimary: true,
      nickname: "参考图1",
      referenceIndex: 1,
      roleLabel: "参考角色",
    },
    {
      isPrimary: true,
      nickname: "参考图2",
      referenceIndex: 2,
      roleLabel: "参考角色",
    },
  ]);
});

test("buildReferenceCharacterStoryPrompt explains identities and relationships", () => {
  const context = parseReferenceCharactersFormValue(
    JSON.stringify({
      primaryReference: "all",
      relationshipNote: "妈妈、爸爸和小宇是一家人",
      characters: [
        { referenceIndex: 1, roleLabel: "妈妈", nickname: "妈妈" },
        { referenceIndex: 2, roleLabel: "孩子", nickname: "小宇" },
      ],
    }),
    2,
  );

  const prompt = buildReferenceCharacterStoryPrompt(context);

  assert.match(prompt, /参考图 1 = 妈妈/);
  assert.match(prompt, /参考图 2 = 小宇/);
  assert.match(prompt, /妈妈、爸爸和小宇是一家人/);
  assert.match(prompt, /不要合并多个角色/);
});

test("buildReferenceCharacterImagePrompt maps characters to image references", () => {
  const context = parseReferenceCharactersFormValue(
    JSON.stringify({
      primaryReference: "1",
      characters: [
        { referenceIndex: 1, roleLabel: "爸爸", nickname: "爸爸" },
        { referenceIndex: 2, roleLabel: "孩子", nickname: "小宇" },
      ],
    }),
    2,
  );

  const prompt = buildReferenceCharacterImagePrompt(context);

  assert.match(prompt, /Reference image 1 is 爸爸/);
  assert.match(prompt, /Reference image 2 is 小宇/);
  assert.match(prompt, /Primary story character/);
  assert.match(prompt, /Do not merge different people/);
});
