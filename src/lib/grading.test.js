import { describe, it, expect } from 'vitest';
import { gradeText, gradeMeaning, gradeChoice, gradeBlanks, normalizeEn } from './grading.js';

describe('채점 규칙', () => {
  it("완성 기준: I'm happy. / i am happy / Im happy 모두 정답", () => {
    expect(gradeText("I'm happy.", 'I am happy.')).toBe(true);
    expect(gradeText('i am happy', 'I am happy.')).toBe(true);
    expect(gradeText('Im happy', 'I am happy.')).toBe(true);
    expect(gradeText("I'm happy.", "I'm happy")).toBe(true);
    expect(gradeText('i am happy', "I'm happy.")).toBe(true);
  });
  it('대소문자·문장부호·공백 무시', () => {
    expect(gradeText('  EVERYONE has a different   taste in FOOD ', 'Everyone has a different taste in food.')).toBe(true);
    expect(gradeText('“Hello,” she said!', 'hello she said')).toBe(true);
    expect(gradeText('well-known', 'well known')).toBe(true);
  });
  it('축약형 = 원형', () => {
    expect(gradeText("don't", 'do not')).toBe(true);
    expect(gradeText('it is', "it's")).toBe(true);
    expect(gradeText("They're here", 'they are here')).toBe(true);
    expect(gradeText("I'll go", 'I will go')).toBe(true);
    expect(gradeText("can't", 'cannot')).toBe(true);
    expect(gradeText("Let's share", 'Let us share')).toBe(true);
  });
  it('철자 오류는 오답, 단어 누락도 오답', () => {
    expect(gradeText('I am hapy', 'I am happy')).toBe(false);
    expect(gradeText('am happy', 'I am happy')).toBe(false);
    expect(gradeText('', 'I am happy')).toBe(false);
  });
  it('복수 정답 "/" 모두 인정', () => {
    const ans = 'Everyone has a different taste in food. / Everybody has a different taste in food.';
    expect(gradeText('everybody has a different taste in food', ans)).toBe(true);
    expect(gradeText('everyone has a different taste in food', ans)).toBe(true);
    expect(gradeText('someone has a different taste in food', ans)).toBe(false);
  });
  it('한글 뜻: 띄어쓰기 무시, 복수 뜻 중 하나만 맞아도 정답', () => {
    expect(gradeMeaning('취향', '취향, 맛')).toBe(true);
    expect(gradeMeaning('맛', '취향, 맛')).toBe(true);
    expect(gradeMeaning('더 좋아하다', '~을 더 좋아하다')).toBe(true);
    expect(gradeMeaning('더좋아하다', '~을 더 좋아하다')).toBe(true);
    expect(gradeMeaning('~을 더 좋아하다', '~을 더 좋아하다')).toBe(true);
    expect(gradeMeaning('건강에좋은', '건강한, 건강에 좋은')).toBe(true);
    expect(gradeMeaning('싫어하다', '~을 더 좋아하다')).toBe(false);
    expect(gradeText('음식은 우리 문화의 중요한 일부이다', '음식은 우리 문화의 중요한 부분이다. / 음식은 우리 문화의 중요한 일부이다.')).toBe(true);
  });
  it('객관식은 번호로', () => {
    expect(gradeChoice(3, '3')).toBe(true);
    expect(gradeChoice('③', '3')).toBe(true);
    expect(gradeChoice(2, '3')).toBe(false);
  });
  it('빈칸 여러 개는 모두 맞아야', () => {
    expect(gradeBlanks(['Different', 'taste'], ['different', 'taste'])).toBe(true);
    expect(gradeBlanks(['different', 'tast'], ['different', 'taste'])).toBe(false);
  });
  it('normalizeEn', () => {
    expect(normalizeEn("Im happy.")).toBe('i am happy');
  });
});
