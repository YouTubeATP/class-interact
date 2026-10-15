import { randomInt } from 'node:crypto';

const ADJECTIVES = ['Curious', 'Bright', 'Calm', 'Clever', 'Gentle', 'Happy', 'Keen', 'Lively', 'Mellow', 'Nimble', 'Plucky', 'Quiet', 'Sunny', 'Swift', 'Witty', 'Zesty', 'Bold', 'Cosy', 'Dapper', 'Eager'];
const ANIMALS = ['Otter', 'Falcon', 'Panda', 'Heron', 'Lynx', 'Koala', 'Gecko', 'Finch', 'Badger', 'Walrus', 'Fox', 'Robin', 'Seal', 'Newt', 'Ibis', 'Yak', 'Crane', 'Moth', 'Wren', 'Hare'];

export function randomName(): string {
  return `${ADJECTIVES[randomInt(ADJECTIVES.length)]} ${ANIMALS[randomInt(ANIMALS.length)]}`;
}
